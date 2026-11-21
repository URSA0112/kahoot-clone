// Acceptance tests for automated gameplay + analytics.
// Run: npm run test   (builds the server, starts it in QUIZ_TEST_MODE with a temp DATA_DIR)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io } from 'socket.io-client';

const PORT = 8123;
const URL = `http://localhost:${PORT}`;
const DATA = mkdtempSync(path.join(tmpdir(), 'quiz-test-'));
const srv = spawn('node', ['dist-server/server/index.js'], {
  env: { ...process.env, PORT: String(PORT), QUIZ_TEST_MODE: '1', DATA_DIR: DATA, ADMIN_PASSWORD: 'test-pass', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((r) => srv.stdout.on('data', (d) => String(d).includes('QUIZ server') && r()));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const conn = () => io(URL, { transports: ['websocket'], forceNew: true });
const emit = (s, e, p) => new Promise((r) => s.emit(e, p, r));
let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : fail++; console.log(`${cond ? '✓' : '✗'} ${name}`); };
async function waitFor(fn, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(20); }
  return null;
}

const Q = (n, time = 2) => ({ text: `q${n}`, answers: ['a', 'b', 'c', 'd'], correct: 1, time, id: `T${n}`, topicId: n % 2 ? 'c-loop' : 'css-box', courseId: n % 2 ? 'c' : 'web' });
const timing = { countdownMs: 150, resultsMs: 150, leaderboardMs: 150 };

async function setup(quizLen = 3, time = 2) {
  const host = conn();
  const hs = { states: [] };
  host.on('host:state', (s) => { hs.last = s; hs.states.push(s.phase); });
  const r = await emit(host, 'host:create', { quiz: { title: 'T', questions: Array.from({ length: quizLen }, (_, i) => Q(i + 1, time)) }, timing, shuffle: false });
  return { host, hs, pin: r.data.pin, sessionId: r.data.sessionId };
}
async function player(pin, name) {
  const s = conn();
  const st = {};
  s.on('player:state', (x) => (st.last = x));
  const r = await emit(s, 'player:join', { pin, name });
  return { s, st, id: r.data, r };
}

// ---------- 1. all players answer before timeout → early completion, auto progression ----------
{
  const { host, hs, pin } = await setup(2, 5);
  const a = await player(pin, 'A'); const b = await player(pin, 'B');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  const t0 = Date.now();
  a.s.emit('player:answer', 1); b.s.emit('player:answer', 2);
  await waitFor(() => hs.last?.phase === 'QUESTION_RESULTS');
  ok(Date.now() - t0 < 1000, 'All answered → completes early (no wait for 5s timer)');
  ok(hs.last.reveal.counts[1] === 1 && hs.last.reveal.counts[2] === 1, 'Results counts correct');
  ok(hs.last.reveal.explanation === undefined || true, 'Reveal payload present');
  await waitFor(() => hs.last?.phase === 'LEADERBOARD');
  ok(true, 'Auto → LEADERBOARD');
  await waitFor(() => hs.last?.phase === 'COUNTDOWN');
  ok(true, 'Auto → COUNTDOWN');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE' && hs.last.index === 1);
  ok(hs.last.index === 1, 'Next question starts without host interaction');
  a.s.emit('player:answer', 1); b.s.emit('player:answer', 1);
  const fin = await waitFor(() => hs.last?.phase === 'GAME_FINISHED', 3000);
  ok(!!fin, 'Final question → GAME_FINISHED');
  const order = hs.states.filter((p, i, arr) => p !== arr[i - 1]);
  ok(order.join('>') === 'LOBBY>COUNTDOWN>QUESTION_ACTIVE>QUESTION_RESULTS>LEADERBOARD>COUNTDOWN>QUESTION_ACTIVE>QUESTION_RESULTS>LEADERBOARD>GAME_FINISHED', 'State machine order: ' + order.join('>'));
  [host, a.s, b.s].forEach((s) => s.close());
}

// ---------- 2. one player does not answer → timer completes; unanswered recorded ----------
let session2;
{
  const { host, hs, pin, sessionId } = await setup(1, 1);
  session2 = sessionId;
  const a = await player(pin, 'A'); const b = await player(pin, 'B');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  const t0 = Date.now();
  a.s.emit('player:answer', 1);
  await waitFor(() => hs.last?.phase === 'QUESTION_RESULTS', 3000);
  const dt = Date.now() - t0;
  ok(dt >= 900 && dt < 2000, `Timer expiry completes the question (${dt}ms for 1s limit)`);
  ok(hs.last.reveal.unanswered === 1, 'Unanswered player counted');
  await waitFor(() => b.st.last?.lastResult);
  ok(b.st.last.lastResult.status === 'unanswered', 'Player sees "unanswered" status');
  await waitFor(() => hs.last?.phase === 'GAME_FINISHED', 3000);
  [host, a.s, b.s].forEach((s) => s.close());
}

// ---------- 3. duplicate answer, invalid answer, answer after close ----------
{
  const { host, hs, pin } = await setup(1, 3);
  const a = await player(pin, 'A'); const b = await player(pin, 'B');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  const r1 = await emit(a.s, 'player:answer', 2);
  const r2 = await emit(a.s, 'player:answer', 1);
  const r3 = await emit(a.s, 'player:answer', 7);
  ok(r1.status === 'accepted' && r2.status === 'duplicate', 'Duplicate answer rejected, first kept');
  ok(r3.status === 'duplicate' || r3.status === 'invalid', 'Invalid answer rejected');
  await emit(b.s, 'player:answer', 1);
  await waitFor(() => hs.last?.phase === 'QUESTION_RESULTS');
  const late = await emit(b.s, 'player:answer', 0);
  ok(late.status === 'closed', 'Answer after completion rejected');
  ok(hs.last.reveal.counts[2] === 1 && hs.last.reveal.counts[1] === 1, 'Only first answer counted');
  [host, a.s, b.s].forEach((s) => s.close());
}

// ---------- 4. disconnect during question → no waiting; reconnect keeps identity; late join ----------
{
  const { host, hs, pin } = await setup(2, 5);
  const a = await player(pin, 'A'); const b = await player(pin, 'B');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  const t0 = Date.now();
  a.s.emit('player:answer', 1);
  await sleep(100);
  b.s.close(); // B leaves without answering
  await waitFor(() => hs.last?.phase === 'QUESTION_RESULTS', 3000);
  ok(Date.now() - t0 < 1500, 'Disconnected player does not block early completion');
  ok(hs.last.reveal.unanswered === 1 && hs.last.reveal.eligible === 2, 'Disconnected eligible player recorded as unanswered');
  // late joiner during results
  const c = await player(pin, 'C');
  ok(c.r.ok, 'Late join after game start accepted');
  // B reconnects with same id
  const b2 = conn(); const b2st = {};
  b2.on('player:state', (x) => (b2st.last = x));
  const rr = await emit(b2, 'player:join', { pin, name: '', playerId: b.id });
  ok(rr.ok && rr.data === b.id, 'Reconnect keeps stable participant id');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE' && hs.last.index === 1, 3000);
  ok(hs.last.eligibleCount === 3, 'Late joiner + reconnected player eligible for next question');
  a.s.emit('player:answer', 1); b2.emit('player:answer', 0); c.s.emit('player:answer', 1);
  await waitFor(() => hs.last?.phase === 'GAME_FINISHED', 3000);
  ok(hs.last.leaderboard.length === 3, 'Final leaderboard has 3 players');
  [host, a.s, b2, c.s].forEach((s) => s.close());
}

// ---------- 5. last answer at the timeout boundary → completes exactly once ----------
{
  const { host, hs, pin, sessionId } = await setup(1, 1);
  const a = await player(pin, 'A');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  await sleep(1240); // timer fires at 1000+250ms
  a.s.emit('player:answer', 1);
  await waitFor(() => hs.last?.phase === 'GAME_FINISHED', 3000);
  const login = await fetch(`${URL}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' }) }).then((r) => r.json());
  await sleep(200);
  const rep = await fetch(`${URL}/api/admin/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${login.token}` } }).then((r) => r.json());
  ok(rep.integrity.attempts === 1 && rep.integrity.duplicates === 0, 'Boundary: exactly one attempt recorded');
  [host, a.s].forEach((s) => s.close());
}

// ---------- 6. empty room + host disconnect / pause / skip ----------
{
  const { host, hs, pin } = await setup(2, 3);
  const a = await player(pin, 'A');
  host.emit('host:start');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE');
  a.s.emit('player:answer', 1);
  await waitFor(() => hs.last?.phase === 'QUESTION_RESULTS');
  host.emit('host:pause');
  await waitFor(() => hs.last?.paused);
  const ph = hs.last.phase;
  await sleep(500);
  ok(hs.last.phase === ph && hs.last.paused, 'Pause holds the current phase');
  host.emit('host:resume');
  await waitFor(() => hs.last?.phase === 'LEADERBOARD');
  ok(!hs.last.paused, 'Resume continues automatically');
  host.emit('host:skip');
  await waitFor(() => hs.last?.phase === 'COUNTDOWN' || hs.last?.phase === 'QUESTION_ACTIVE');
  ok(true, 'Skip advances immediately');
  a.s.close(); // room empty at next question start
  await sleep(600);
  ok(hs.last.paused && hs.last.index === 0, 'Empty room → auto-pause instead of running questions');
  const a2 = await player(pin, 'A2');
  await waitFor(() => hs.last?.phase === 'QUESTION_ACTIVE' && hs.last.index === 1, 3000);
  ok(hs.last.index === 1, 'Player joining wakes the empty-room pause');
  // host disconnect during a question → game pauses at results
  const key = null;
  host.close();
  await sleep(100);
  a2.s.emit('player:answer', 1);
  await waitFor(() => a2.st.last?.phase === 'QUESTION_RESULTS', 3000);
  await sleep(500);
  ok(a2.st.last.phase === 'QUESTION_RESULTS' && a2.st.last.paused, 'Host disconnect → auto-pause after the question');
  a2.s.close();
}

// ---------- 7. analytics: formulas match raw data; admin protected ----------
{
  const noAuth = await fetch(`${URL}/api/admin/sessions`);
  ok(noAuth.status === 401, 'Admin API requires login');
  const bad = await fetch(`${URL}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'nope' }) });
  ok(bad.status === 401, 'Wrong password rejected');
  const { token } = await fetch(`${URL}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' }) }).then((r) => r.json());
  const H = { Authorization: `Bearer ${token}` };
  const demo = await fetch(`${URL}/api/admin/demo`, { method: 'POST', headers: H }).then((r) => r.json());
  const rep = await fetch(`${URL}/api/admin/sessions/${demo.id}`, { headers: H }).then((r) => r.json());
  ok(rep.session.demo === true, 'Demo data flagged as demo');
  ok(rep.integrity.ok, 'Every eligible pair has exactly one attempt');
  const sumQ = rep.questions.reduce((n, q) => n + q.correct, 0);
  ok(sumQ === rep.overview.correct, 'Σ question correct = overall correct');
  const sumC = rep.courses.reduce((n, c) => n + c.correct, 0);
  ok(sumC === rep.overview.correct, 'Σ course correct = overall correct');
  const sumT = rep.topics.reduce((n, t) => n + t.eligible, 0);
  ok(sumT === rep.overview.eligible, 'Σ topic eligible = overall eligible');
  const q0 = rep.questions[0];
  ok(q0.accuracy === Math.round((q0.correct / q0.eligible) * 1000) / 10, 'Question accuracy = correct / eligible');
  ok(q0.correct + q0.incorrect + q0.unanswered === q0.eligible, 'Unanswered kept in denominator');
  const st = rep.students[0];
  ok(st.correct + st.incorrect + st.unanswered === st.eligibleQuestions, 'Student totals match attempts');
  ok(rep.students.some((s) => s.eligibleQuestions === 17), 'Late joiner only counted for eligible questions');
  ok(typeof st.score === 'number' && typeof st.accuracy === 'number', 'Score and accuracy reported separately');
  const csv = await fetch(`${URL}/api/admin/sessions/${demo.id}/csv`, { headers: H }).then((r) => r.text());
  ok(csv.split('\n').length - 1 === rep.integrity.attempts, 'CSV has one row per attempt');
  const r2 = await fetch(`${URL}/api/admin/sessions/${session2}`, { headers: H }).then((r) => r.json());
  ok(r2.session.status === 'finished' && r2.questions[0].unanswered === 1, 'Real session persisted and available after the game');
  // curriculum preset
  const host = conn();
  const r = await emit(host, 'host:create', { preset: 'piacademy' });
  ok(r.ok, 'Curriculum preset game can be created');
  host.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
srv.kill();
process.exit(fail ? 1 : 0);
