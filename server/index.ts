import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type { Ack, Quiz } from '../shared/types.js';
import { Game } from './game.js';
import { generateQuiz } from './ai.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
const http = createServer(app);
const io = new Server(http, { cors: { origin: '*' } });

const games = new Map<string, Game>();

function newPin() {
  let pin: string;
  do pin = String(Math.floor(100000 + Math.random() * 900000));
  while (games.has(pin));
  return pin;
}

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
        x.correct >= 0 &&
        x.correct <= 3 &&
        x.time >= 5 &&
        x.time <= 120,
    )
  );
}

app.get('/api/health', (_req, res) => res.json({ ok: true, games: games.size }));

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

io.on('connection', (socket) => {
  let hostOf: Game | null = null;
  let playerOf: { game: Game; id: string } | null = null;

  socket.on('host:create', (quiz: Quiz, ack: (r: Ack<{ pin: string; hostKey: string }>) => void) => {
    if (!validQuiz(quiz)) return ack({ ok: false, error: 'Асуултууд буруу байна' });
    const pin = newPin();
    const game = new Game(io, pin, socket.id, quiz);
    games.set(pin, game);
    hostOf = game;
    ack({ ok: true, data: { pin, hostKey: game.hostKey } });
    game.broadcast();
  });

  // host refreshed the page -> take the game back
  socket.on('host:rejoin', (data: { pin: string; hostKey: string }, ack: (r: Ack) => void) => {
    const game = games.get(data?.pin);
    if (!game || game.hostKey !== data.hostKey) return ack({ ok: false, error: 'not found' });
    game.hostSocketId = socket.id;
    hostOf = game;
    ack({ ok: true });
    game.broadcast();
  });

  socket.on('host:start', () => hostOf?.start());
  socket.on('host:next', () => hostOf?.next());
  socket.on('host:kick', (playerId: string) => {
    if (!hostOf || hostOf.phase !== 'lobby') return;
    const p = hostOf.players.get(playerId);
    if (p?.socketId) io.to(p.socketId).emit('player:kicked');
    hostOf.players.delete(playerId);
    hostOf.broadcast();
  });

  socket.on(
    'player:join',
    (data: { pin: string; name: string; playerId?: string }, ack: (r: Ack<string>) => void) => {
      const game = games.get(String(data?.pin ?? '').trim());
      if (!game) return ack({ ok: false, error: 'Тоглоом олдсонгүй. PIN-ээ шалгана уу.' });
      const name = String(data.name ?? '').trim().slice(0, 20);
      const rejoin = data.playerId && game.players.has(data.playerId);
      if (!rejoin) {
        if (!name) return ack({ ok: false, error: 'Нэрээ оруулна уу' });
        if (game.phase !== 'lobby') return ack({ ok: false, error: 'Тоглоом аль хэдийн эхэлсэн байна' });
        if ([...game.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase()))
          return ack({ ok: false, error: 'Энэ нэр аль хэдийн байна' });
      }
      const id = rejoin ? data.playerId! : randomUUID();
      game.addPlayer(id, socket.id, name);
      playerOf = { game, id };
      ack({ ok: true, data: id });
      game.broadcast();
    },
  );

  socket.on('player:answer', (choice: number) => {
    if (playerOf) playerOf.game.answer(playerOf.id, Number(choice));
  });

  socket.on('disconnect', () => {
    if (hostOf) {
      const game = hostOf;
      // give the host 60s to come back, otherwise close the game
      setTimeout(() => {
        if (game.hostSocketId === socket.id) {
          game.clearTimer();
          for (const p of game.players.values()) if (p.socketId) io.to(p.socketId).emit('player:kicked');
          games.delete(game.pin);
        }
      }, 60_000);
    }
    if (playerOf) {
      const { game, id } = playerOf;
      const p = game.players.get(id);
      if (p && p.socketId === socket.id) {
        if (game.phase === 'lobby') game.players.delete(id);
        else p.socketId = null;
        game.broadcast();
      }
    }
  });
});

// Serve the built React app
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(__dirname, '../../dist-client');
app.use(express.static(clientDir));
app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));

const port = Number(process.env.PORT) || 8080;
http.listen(port, () => console.log(`QUIZ server on :${port}`));
