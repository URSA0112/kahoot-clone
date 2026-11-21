export type Question = {
  text: string;
  answers: [string, string, string, string];
  correct: number; // 0-3
  time: number; // seconds
};

export type Quiz = {
  title: string;
  questions: Question[];
};

export type PlayerInfo = { id: string; name: string; score: number };

export type Phase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended';

/** What the host screen receives */
export type HostState = {
  pin: string;
  title: string;
  phase: Phase;
  players: PlayerInfo[];
  index: number;
  total: number;
  question?: Question & { endsAt: number };
  answeredCount: number;
  counts?: number[];
  leaderboard?: PlayerInfo[];
};

/** What a player's phone receives */
export type PlayerState = {
  pin: string;
  name: string;
  phase: Phase;
  index: number;
  total: number;
  question?: { text: string; answers: string[]; endsAt: number };
  answered: boolean;
  lastResult?: { correct: boolean; points: number; correctAnswer: string };
  score: number;
  rank: number;
  playerCount: number;
};

export type Ack<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
