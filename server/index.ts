import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { Ack, Quiz, Timing } from '../shared/types.js';
import { CURRICULUM_QUIZ, COURSES, TOPICS } from '../shared/curriculum.js';
import { DEFAULT_TIMING, Game, shuffleQuestion } from './game.js';
import { generateQuiz } from './ai.js';
import { applyRetention, createStore } from './store.js';
import { attemptsCsv, buildReport } from './analytics.js';
import { login, requireAdmin } from './auth.js';
import { makeDemoSession } from './demo.js';

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });
const store = createStore();
applyRetention(store).catch((e) => console.error('retention failed', e));

const games = new Map<string, Game>();

function newPin() {
  let pin: string;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}

// TEST_MODE lets the acceptance tests use very short timers; never set it in production.
const TEST_MODE = process.env.QUIZ_TEST_MODE === '1';
const MIN_Q_SEC = TEST_MODE ? 1 : 5;
const MIN_PHASE_MS = TEST_MODE ? 100 : 1000;

function validQuiz(q: unknown): q is Quiz {
  const quiz = q as Quiz;
  return (
    !!quiz &&
    typeof quiz.title === 'string' &&
    Array.isArray(quiz.questions) &&
    quiz.questions.length > 0 &&
    quiz.questions.length <= 50 &&
    quiz.questions.every(
      (x) =>
        typeof x.text === 'string' &&
        Array.isArray(x.answers) &&
        x.answers.length === 4 &&
        x.answers.every((a) => typeof a === 'string') &&
        Number.isInteger(x.correct) &&
        x.correct >= 0 &&
        x.correct <= 3 &&
        x.time >= MIN_Q_SEC &&
        x.time <= 120,
    )
  );
}

function clampTiming(t?: Partial<Timing>): Timing {
  const c = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  return {
    countdownMs: c(t?.countdownMs, DEFAULT_TIMING.countdownMs, MIN_PHASE_MS, 10_000),
    resultsMs: c(t?.resultsMs, DEFAULT_TIMING.resultsMs, TEST_MODE ? 100 : 2000, 60_000),
    leaderboardMs: c(t?.leaderboardMs, DEFAULT_TIMING.leaderboardMs, TEST_MODE ? 100 : 2000, 60_000),
  };
}

// ---------------- public API ----------------
app.get('/api/health', (_req, res) => res.json({ ok: true, games: games.size }));

app.get('/api/curriculum/summary', (_req, res) => {
  // no answers here: students can open this URL too
  res.json({
    title: CURRICULUM_QUIZ.title,
    questions: CURRICULUM_QUIZ.questions.length,
    courses: COURSES,
    byCourse: COURSES.map((c) => ({ id: c.id, n: CURRICULUM_QUIZ.questions.filter((q) => q.courseId === c.id).length })),
  });
});

app.post('/api/generate', async (req, res) => {
  const { topic, count = 5, language = 'Mongolian', time = 20 } = req.body ?? {};
  if (!topic || typeof topic !== 'string') return res.status(400).json({ error: 'topic required' });
  try {
    const quiz = await generateQuiz(topic.slice(0, 200), Number(count), String(language), Number(time) || 20);
    res.json(quiz);
  } catch (e) {
    console.error('generate failed', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// ---------------- admin API ----------------
app.post('/api/admin/login', login);

app.get('/api/admin/sessions', requireAdmin, async (_req, res) => {
  const all = await store.list();
  res.json(
    all
      .filter((s) => s.status !== 'lobby')
      .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
      .map((s) => ({
        id: s.id,
        title: s.title,
        pin: s.pin,
        status: s.status,
        demo: !!s.demo,
        startedAt: s.startedAt,
        finishedAt: s.finishedAt,
        participants: s.participants.length,
        questions: s.quiz.questions.length,
        asked: Object.keys(s.eligibility).length,
      })),
  );
});

app.get('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
  const s = await store.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(buildReport(s));
});

app.get('/api/admin/sessions/:id/csv', requireAdmin, async (req, res) => {
  const s = await store.get(req.params.id);
  if (!s) return res.status(404).send('not found');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="quiz-${s.id.slice(0, 8)}.csv"`);
  res.send(attemptsCsv(s));
});

app.post('/api/admin/demo', requireAdmin, async (_req, res) => {
  const s = makeDemoSession();
  await store.save(s);
  res.json({ id: s.id });
});

app.delete('/api/admin/sessions/:id', requireAdmin, async (req, res) => {
  await store.remove(req.params.id);
  res.json({ ok: true });
});

// ---------------- realtime ----------------
io.on('connection', (socket) => {
  let hostOf: Game | null = null;
  let playerOf: { game: Game; id: string } | null = null;

  socket.on(
    'host:create',
    (
      data: { preset?: 'piacademy'; quiz?: Quiz; timing?: Partial<Timing>; shuffle?: boolean },
      ack: (r: Ack<{ pin: string; hostKey: string; sessionId: string }>) => void,
    ) => {
      let quiz: Quiz;
      if (data?.preset === 'piacademy') quiz = structuredClone(CURRICULUM_QUIZ);
      else if (validQuiz(data?.quiz)) quiz = data.quiz;
      else return ack({ ok: false, error: 'Асуултууд буруу байна' });
      if (data.shuffle !== false) quiz = { ...quiz, questions: quiz.questions.map((q) => shuffleQuestion(q)) };
      const pin = newPin();
      const game = new Game(io, store, pin, socket.id, quiz, clampTiming(data.timing), (g) => {
        setTimeout(() => games.get(g.pin) === g && games.delete(g.pin), 30 * 60_000);
      });
      games.set(pin, game);
      hostOf = game;
      ack({ ok: true, data: { pin, hostKey: game.hostKey, sessionId: game.record.id } });
      game.broadcast();
    },
  );

  socket.on('host:rejoin', (data: { pin: string; hostKey: string }, ack: (r: Ack) => void) => {
    const game = games.get(data?.pin);
    if (!game || game.hostKey !== data.hostKey) return ack({ ok: false, error: 'not found' });
    hostOf = game;
    game.hostReconnected(socket.id);
    ack({ ok: true });
  });

  socket.on('host:start', () => hostOf?.start());
  socket.on('host:pause', () => hostOf?.pause());
  socket.on('host:resume', () => hostOf?.resume());
  socket.on('host:skip', () => hostOf?.skip());
  socket.on('host:end', () => hostOf?.finish('finished'));
  socket.on('host:kick', (playerId: string) => hostOf?.kick(playerId));

  socket.on(
    'player:join',
    (data: { pin: string; name: string; playerId?: string }, ack: (r: Ack<string>) => void) => {
      const game = games.get(String(data?.pin ?? '').trim());
      if (!game || game.phase === 'GAME_FINISHED') return ack({ ok: false, error: 'Тоглоом олдсонгүй. PIN-ээ шалгана уу.' });
      if (data.playerId && game.players.has(data.playerId)) {
        game.reconnect(data.playerId, socket.id);
        playerOf = { game, id: data.playerId };
        return ack({ ok: true, data: data.playerId });
      }
      const name = String(data.name ?? '').trim().slice(0, 20);
      if (!name) return ack({ ok: false, error: 'Нэрээ оруулна уу' });
      if ([...game.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase()))
        return ack({ ok: false, error: 'Энэ нэр аль хэдийн байна' });
      const p = game.addPlayer(name, socket.id);
      playerOf = { game, id: p.id };
      ack({ ok: true, data: p.id });
    },
  );

  socket.on('player:answer', (choice: number, ack?: (r: { status: string }) => void) => {
    const status = playerOf ? playerOf.game.answer(playerOf.id, Number(choice)) : 'invalid';
    if (typeof ack === 'function') ack({ status });
  });

  socket.on('disconnect', () => {
    if (hostOf && hostOf.hostSocketId === socket.id) hostOf.hostDisconnected();
    if (playerOf) playerOf.game.disconnect(playerOf.id, socket.id);
  });
});

// Serve the built React app
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '../../dist-client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const port = Number(process.env.PORT) || 8080;
http.listen(port, () => console.log(`QUIZ server on :${port}`));

export { app, http, io, games, store };
