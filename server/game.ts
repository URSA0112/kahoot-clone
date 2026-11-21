import type { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type { HostState, Phase, PlayerInfo, PlayerState, Quiz } from '../shared/types.js';

type Player = {
  id: string; // stable id (survives reconnects)
  socketId: string | null;
  name: string;
  score: number;
  answer: number | null;
  answeredAt: number;
  lastPoints: number;
};

export class Game {
  phase: Phase = 'lobby';
  index = -1;
  players = new Map<string, Player>();
  questionStart = 0;
  endsAt = 0;
  timer: NodeJS.Timeout | null = null;
  hostKey = randomUUID();

  constructor(
    public io: Server,
    public pin: string,
    public hostSocketId: string,
    public quiz: Quiz,
  ) {}

  get question() {
    return this.quiz.questions[this.index];
  }

  sortedPlayers(): PlayerInfo[] {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, score: p.score }))
      .sort((a, b) => b.score - a.score);
  }

  addPlayer(id: string, socketId: string, name: string) {
    const existing = this.players.get(id);
    if (existing) {
      existing.socketId = socketId; // reconnect
      return existing;
    }
    const p: Player = { id, socketId, name, score: 0, answer: null, answeredAt: 0, lastPoints: 0 };
    this.players.set(id, p);
    return p;
  }

  start() {
    if (this.phase !== 'lobby') return;
    this.nextQuestion();
  }

  /** Host pressed "next": reveal -> leaderboard -> next question / end */
  next() {
    if (this.phase === 'question') return this.reveal();
    if (this.phase === 'reveal') {
      if (this.index >= this.quiz.questions.length - 1) return this.end();
      this.phase = 'leaderboard';
      return this.broadcast();
    }
    if (this.phase === 'leaderboard') return this.nextQuestion();
  }

  nextQuestion() {
    this.index++;
    for (const p of this.players.values()) {
      p.answer = null;
      p.lastPoints = 0;
    }
    this.phase = 'question';
    this.questionStart = Date.now();
    this.endsAt = this.questionStart + this.question.time * 1000;
    this.clearTimer();
    this.timer = setTimeout(() => this.reveal(), this.question.time * 1000 + 300);
    this.broadcast();
  }

  answer(playerId: string, choice: number) {
    const p = this.players.get(playerId);
    if (!p || this.phase !== 'question' || p.answer !== null) return;
    if (choice < 0 || choice > 3) return;
    p.answer = choice;
    p.answeredAt = Date.now();
    if (choice === this.question.correct) {
      // Kahoot-style: faster answer = more points (500..1000)
      const elapsed = Math.min(p.answeredAt - this.questionStart, this.question.time * 1000);
      const ratio = elapsed / (this.question.time * 1000);
      p.lastPoints = Math.round(1000 * (1 - ratio / 2));
      p.score += p.lastPoints;
    }
    const allAnswered = [...this.players.values()].every((x) => x.answer !== null || !x.socketId);
    if (allAnswered) this.reveal();
    else this.broadcast();
  }

  reveal() {
    if (this.phase !== 'question') return;
    this.clearTimer();
    this.phase = 'reveal';
    this.broadcast();
  }

  end() {
    this.clearTimer();
    this.phase = 'ended';
    this.broadcast();
  }

  clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  hostState(): HostState {
    const q = this.question;
    const ps = [...this.players.values()];
    const s: HostState = {
      pin: this.pin,
      title: this.quiz.title,
      phase: this.phase,
      players: this.sortedPlayers(),
      index: this.index,
      total: this.quiz.questions.length,
      answeredCount: ps.filter((p) => p.answer !== null).length,
    };
    if (q && this.phase !== 'lobby') s.question = { ...q, endsAt: this.endsAt };
    if (this.phase === 'reveal') {
      s.counts = [0, 1, 2, 3].map((i) => ps.filter((p) => p.answer === i).length);
    }
    if (this.phase === 'leaderboard' || this.phase === 'ended') s.leaderboard = this.sortedPlayers();
    return s;
  }

  playerState(p: Player): PlayerState {
    const sorted = this.sortedPlayers();
    const q = this.question;
    const s: PlayerState = {
      pin: this.pin,
      name: p.name,
      phase: this.phase,
      index: this.index,
      total: this.quiz.questions.length,
      answered: p.answer !== null,
      score: p.score,
      rank: sorted.findIndex((x) => x.id === p.id) + 1,
      playerCount: sorted.length,
    };
    if (q && this.phase === 'question') s.question = { text: q.text, answers: q.answers, endsAt: this.endsAt };
    if (q && this.phase !== 'lobby' && this.phase !== 'question') {
      s.lastResult = {
        correct: p.answer === q.correct,
        points: p.lastPoints,
        correctAnswer: q.answers[q.correct],
      };
    }
    return s;
  }

  broadcast() {
    this.io.to(this.hostSocketId).emit('host:state', this.hostState());
    for (const p of this.players.values()) {
      if (p.socketId) this.io.to(p.socketId).emit('player:state', this.playerState(p));
    }
  }
}
