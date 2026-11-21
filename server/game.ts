import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type {
  GameSessionRecord,
  HostState,
  Phase,
  PlayerInfo,
  PlayerState,
  Question,
  QuestionAttempt,
  Quiz,
  Timing,
} from '../shared/types.js';
import type { Store } from './store.js';

export const DEFAULT_TIMING: Timing = { countdownMs: 3000, resultsMs: 5000, leaderboardMs: 5000 };

type Player = {
  id: string; // stable, session-scoped participant id (never the nickname)
  socketId: string | null;
  name: string;
  score: number;
  joinedAt: number;
  answer: { choice: number; at: number } | null;
  lastPoints: number;
};

/** Shuffle answer order (keeps correct index + misconception metadata aligned). */
export function shuffleQuestion(q: Question, rnd = Math.random): Question {
  const order = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    answers: order.map((i) => q.answers[i]) as Question['answers'],
    correct: order.indexOf(q.correct),
    misconceptions: q.misconceptions ? order.map((i) => q.misconceptions![i] ?? null) : undefined,
  };
}

/**
 * Server-authoritative game state machine.
 *
 *   LOBBY → COUNTDOWN → QUESTION_ACTIVE → QUESTION_RESULTS → LEADERBOARD → COUNTDOWN → … → GAME_FINISHED
 *
 * Eligibility (who counts for a question):
 *   a participant is ELIGIBLE for question N if they are in the session and CONNECTED at the moment
 *   question N starts. Eligible players who disconnect and never answer are recorded as "unanswered".
 *   Players who join (or are disconnected) when a question starts are not eligible for it; they
 *   become eligible from the next question. Denominators in analytics use eligible counts only.
 *
 * Early completion: a question completes when the timer expires OR every eligible player who is
 * currently connected has an accepted answer (or no eligible player is connected any more).
 * completeQuestion() is idempotent: it only runs while phase === QUESTION_ACTIVE, and the phase is
 * switched synchronously before anything else happens, so the "last answer" and "timer" paths can
 * never both complete the same question (Node runs one callback at a time).
 */
export class Game {
  phase: Phase = 'LOBBY';
  paused = false;
  pausedRemainingMs: number | null = null;
  phaseEndsAt: number | null = null;
  index = -1;
  players = new Map<string, Player>();
  eligible = new Set<string>();
  questionStart = 0;
  timer: NodeJS.Timeout | null = null;
  hostKey = randomUUID();
  hostConnected = true;
  hostGoneTimer: NodeJS.Timeout | null = null;
  record: GameSessionRecord;
  private saveChain: Promise<void> = Promise.resolve();

  constructor(
    public io: Server,
    public store: Store,
    public pin: string,
    public hostSocketId: string,
    quiz: Quiz,
    public timing: Timing = DEFAULT_TIMING,
    public onFinish?: (g: Game) => void,
  ) {
    this.record = {
      id: randomUUID(),
      pin,
      title: quiz.title,
      quiz,
      startedAt: null,
      finishedAt: null,
      status: 'lobby',
      participants: [],
      eligibility: {},
      attempts: [],
    };
  }

  get quiz() {
    return this.record.quiz;
  }
  get question() {
    return this.quiz.questions[this.index];
  }
  get isLast() {
    return this.index >= this.quiz.questions.length - 1;
  }

  // ---------- persistence ----------
  persist() {
    const snapshot = JSON.parse(JSON.stringify(this.record)) as GameSessionRecord;
    this.saveChain = this.saveChain
      .then(() => this.store.save(snapshot))
      .catch((e) => console.error('persist failed', e));
    return this.saveChain;
  }

  // ---------- players ----------
  sortedPlayers(): PlayerInfo[] {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: !!p.socketId }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  addPlayer(name: string, socketId: string) {
    const p: Player = {
      id: randomUUID(),
      socketId,
      name,
      score: 0,
      joinedAt: Date.now(),
      answer: null,
      lastPoints: 0,
    };
    this.players.set(p.id, p);
    queueMicrotask(() => this.wakeIfEmptyPaused());
    this.record.participants.push({
      id: p.id,
      nickname: name,
      joinedAt: p.joinedAt,
      joinedAtQuestion: this.phase === 'LOBBY' ? 0 : this.index + 1,
      finalScore: 0,
      finalRank: 0,
    });
    this.broadcast();
    return p;
  }

  reconnect(id: string, socketId: string) {
    const p = this.players.get(id);
    if (!p) return null;
    p.socketId = socketId;
    this.wakeIfEmptyPaused();
    this.broadcast();
    return p;
  }

  disconnect(id: string, socketId: string) {
    const p = this.players.get(id);
    if (!p || p.socketId !== socketId) return;
    if (this.phase === 'LOBBY') {
      this.players.delete(id);
      this.record.participants = this.record.participants.filter((x) => x.id !== id);
    } else {
      p.socketId = null;
    }
    if (this.phase === 'QUESTION_ACTIVE') this.checkAllAnswered();
    this.broadcast();
  }

  kick(id: string) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'LOBBY') return;
    if (p.socketId) this.io.to(p.socketId).emit('player:kicked');
    this.players.delete(id);
    this.record.participants = this.record.participants.filter((x) => x.id !== id);
    this.broadcast();
  }

  // ---------- timers ----------
  private schedule(ms: number, fn: () => void) {
    this.clearTimer();
    this.phaseEndsAt = Date.now() + ms;
    this.pendingFn = fn;
    if (this.paused) {
      this.pausedRemainingMs = ms;
      this.timer = null;
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms);
  }
  private pendingFn: (() => void) | null = null;
  /** paused automatically because nobody was connected; resumes when someone (re)joins */
  private emptyPause = false;
  private wakeIfEmptyPaused() {
    if (this.emptyPause && this.hostConnected) {
      this.emptyPause = false;
      this.resume();
    }
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  pause() {
    if (this.paused || this.phase === 'LOBBY' || this.phase === 'GAME_FINISHED') return;
    if (this.phase === 'QUESTION_ACTIVE') return; // answers are timed; pause after the question
    this.paused = true;
    this.pausedRemainingMs = Math.max(0, (this.phaseEndsAt ?? Date.now()) - Date.now());
    this.clearTimer();
    this.broadcast();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    const ms = this.pausedRemainingMs ?? 0;
    this.pausedRemainingMs = null;
    if (this.pendingFn) this.schedule(ms, this.pendingFn);
    this.broadcast();
  }

  /** Host "skip": end the current waiting phase now (not allowed during an active question). */
  skip() {
    if (this.phase === 'QUESTION_ACTIVE' || this.phase === 'LOBBY' || this.phase === 'GAME_FINISHED') return;
    const fn = this.pendingFn;
    this.paused = false;
    this.pausedRemainingMs = null;
    this.clearTimer();
    fn?.();
  }

  // ---------- state machine ----------
  start() {
    if (this.phase !== 'LOBBY' || this.players.size === 0) return;
    this.record.startedAt = Date.now();
    this.record.status = 'running';
    this.toCountdown();
    this.persist();
  }

  private toCountdown() {
    this.phase = 'COUNTDOWN';
    this.schedule(this.timing.countdownMs, () => this.startQuestion());
    this.broadcast();
  }

  private startQuestion() {
    const connected = [...this.players.values()].filter((p) => p.socketId);
    if (connected.length === 0) {
      // empty room: wait instead of racing through questions with nobody playing
      this.paused = true;
      this.emptyPause = true;
      this.pausedRemainingMs = this.timing.countdownMs;
      this.pendingFn = () => this.startQuestion();
      this.broadcast();
      return;
    }
    this.index++;
    this.phase = 'QUESTION_ACTIVE';
    for (const p of this.players.values()) {
      p.answer = null;
      p.lastPoints = 0;
    }
    this.eligible = new Set(connected.map((p) => p.id));
    this.record.eligibility[this.index] = [...this.eligible];
    this.questionStart = Date.now();
    // +250ms grace so a tap at "0" that is still in flight is accepted
    this.schedule(this.question.time * 1000 + 250, () => this.completeQuestion('timer'));
    this.broadcast();
  }

  /** returns a short status for the ack */
  answer(playerId: string, choice: number): 'accepted' | 'duplicate' | 'closed' | 'not_eligible' | 'invalid' {
    if (this.phase !== 'QUESTION_ACTIVE') return 'closed';
    const p = this.players.get(playerId);
    if (!p) return 'invalid';
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) return 'invalid';
    if (!this.eligible.has(playerId)) return 'not_eligible';
    if (p.answer) return 'duplicate';
    const now = Date.now();
    const limit = this.question.time * 1000;
    p.answer = { choice, at: now };
    if (choice === this.question.correct) {
      const elapsed = Math.min(now - this.questionStart, limit);
      p.lastPoints = Math.round(1000 * (1 - elapsed / limit / 2)); // 500..1000, rewards speed
      p.score += p.lastPoints;
    }
    if (!this.checkAllAnswered()) this.broadcast();
    return 'accepted';
  }

  /** completes the question if every connected eligible player has answered */
  private checkAllAnswered() {
    if (this.phase !== 'QUESTION_ACTIVE') return false;
    const waiting = [...this.eligible].some((id) => {
      const p = this.players.get(id);
      return p && p.socketId && !p.answer;
    });
    if (!waiting) {
      this.completeQuestion('all_answered');
      return true;
    }
    return false;
  }

  completeQuestion(reason: 'timer' | 'all_answered') {
    if (this.phase !== 'QUESTION_ACTIVE') return; // exactly-once guard
    this.phase = 'QUESTION_RESULTS';
    this.clearTimer();
    const q = this.question;
    const limit = q.time * 1000;
    const qid = q.id ?? `Q${String(this.index + 1).padStart(2, '0')}`;
    for (const id of this.eligible) {
      const p = this.players.get(id);
      if (!p) continue;
      const a = p.answer;
      const isCorrect = !!a && a.choice === q.correct;
      const attempt: QuestionAttempt = {
        sessionId: this.record.id,
        participantId: id,
        questionId: qid,
        questionIndex: this.index,
        selectedOption: a ? a.choice : null,
        status: a ? (isCorrect ? 'correct' : 'incorrect') : 'unanswered',
        isCorrect,
        responseTimeMs: a ? Math.min(a.at - this.questionStart, limit) : null,
        timeLimitMs: limit,
        scoreAwarded: isCorrect ? p.lastPoints : 0,
        topicId: q.topicId ?? null,
        courseId: q.courseId ?? null,
        difficulty: q.difficulty ?? null,
        submittedAt: a ? a.at : null,
        timedOut: !a && reason === 'timer',
      };
      this.record.attempts.push(attempt);
    }
    this.syncScores();
    this.persist();
    this.schedule(this.timing.resultsMs, () => this.toLeaderboard());
    if (!this.hostConnected) this.pause();
    this.broadcast();
  }

  private toLeaderboard() {
    this.phase = 'LEADERBOARD';
    this.schedule(this.timing.leaderboardMs, () => (this.isLast ? this.finish('finished') : this.toCountdown()));
    if (!this.hostConnected) this.pause();
    this.broadcast();
  }

  finish(status: 'finished' | 'abandoned') {
    if (this.phase === 'GAME_FINISHED') return;
    this.clearTimer();
    this.pendingFn = null;
    this.paused = false;
    this.phase = 'GAME_FINISHED';
    this.phaseEndsAt = null;
    this.record.finishedAt = Date.now();
    this.record.status = status;
    this.syncScores();
    this.persist();
    this.broadcast();
    this.onFinish?.(this);
  }

  private syncScores() {
    const sorted = this.sortedPlayers();
    for (const r of this.record.participants) {
      const p = this.players.get(r.id);
      if (!p) continue;
      r.finalScore = p.score;
      r.finalRank = sorted.findIndex((x) => x.id === r.id) + 1;
    }
  }

  hostDisconnected() {
    this.hostConnected = false;
    this.pause();
    this.hostGoneTimer = setTimeout(() => this.finish('abandoned'), 10 * 60_000);
  }
  hostReconnected(socketId: string) {
    this.hostSocketId = socketId;
    this.hostConnected = true;
    if (this.hostGoneTimer) clearTimeout(this.hostGoneTimer);
    this.broadcast();
  }

  // ---------- views ----------
  hostState(): HostState {
    const q = this.question;
    const s: HostState = {
      pin: this.pin,
      sessionId: this.record.id,
      title: this.quiz.title,
      phase: this.phase,
      paused: this.paused,
      serverNow: Date.now(),
      phaseEndsAt: this.phaseEndsAt,
      pausedRemainingMs: this.pausedRemainingMs,
      timing: this.timing,
      players: this.sortedPlayers(),
      index: this.index,
      total: this.quiz.questions.length,
      answeredCount: [...this.eligible].filter((id) => this.players.get(id)?.answer).length,
      eligibleCount: this.eligible.size,
    };
    if (q && this.phase !== 'LOBBY' && this.phase !== 'COUNTDOWN') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { misconceptions, ...rest } = q;
      s.question = rest;
    }
    if (q && (this.phase === 'QUESTION_RESULTS' || this.phase === 'LEADERBOARD')) {
      const answers = [...this.eligible].map((id) => this.players.get(id)?.answer?.choice ?? null);
      s.reveal = {
        correct: q.correct,
        counts: [0, 1, 2, 3].map((i) => answers.filter((a) => a === i).length),
        unanswered: answers.filter((a) => a === null).length,
        eligible: this.eligible.size,
        explanation: q.explanation,
        keyConcept: q.keyConcept,
        commonMistake: q.commonMistake,
      };
    }
    if (this.phase === 'LEADERBOARD' || this.phase === 'GAME_FINISHED') s.leaderboard = this.sortedPlayers();
    return s;
  }

  playerState(p: Player): PlayerState {
    const sorted = this.sortedPlayers();
    const q = this.question;
    const eligible = this.eligible.has(p.id);
    const s: PlayerState = {
      pin: this.pin,
      name: p.name,
      phase: this.phase,
      paused: this.paused,
      serverNow: Date.now(),
      phaseEndsAt: this.phaseEndsAt,
      index: this.index,
      total: this.quiz.questions.length,
      eligible,
      answered: !!p.answer,
      score: p.score,
      rank: sorted.findIndex((x) => x.id === p.id) + 1,
      playerCount: sorted.length,
    };
    if (q && this.phase === 'QUESTION_ACTIVE')
      s.question = { text: q.text, answers: q.answers, code: q.code, codeLang: q.codeLang };
    if (q && (this.phase === 'QUESTION_RESULTS' || this.phase === 'LEADERBOARD')) {
      s.lastResult = {
        status: !eligible ? 'not_eligible' : !p.answer ? 'unanswered' : p.answer.choice === q.correct ? 'correct' : 'incorrect',
        points: p.lastPoints,
        correctAnswer: q.answers[q.correct],
        explanation: q.explanation,
        keyConcept: q.keyConcept,
      };
    }
    return s;
  }

  broadcast() {
    if (this.hostConnected) this.io.to(this.hostSocketId).emit('host:state', this.hostState());
    for (const p of this.players.values()) {
      if (p.socketId) this.io.to(p.socketId).emit('player:state', this.playerState(p));
    }
  }
}
