export type Difficulty = 'foundational' | 'intermediate' | 'advanced';

export type Question = {
  text: string;
  answers: [string, string, string, string];
  correct: number; // 0-3
  time: number; // seconds
  // --- V2 curriculum metadata (optional for AI/custom quizzes) ---
  id?: string;
  courseId?: string;
  topicId?: string;
  objective?: string;
  difficulty?: Difficulty;
  code?: string;
  codeLang?: 'c' | 'html' | 'css' | 'js' | 'text';
  explanation?: string;
  keyConcept?: string;
  commonMistake?: string;
  /** misconception behind each option; null for the correct one */
  misconceptions?: (string | null)[];
  source?: string;
};

export type Quiz = {
  id?: string;
  title: string;
  questions: Question[];
};

export type Course = { id: string; name: string; url: string };
export type Topic = { id: string; courseId: string; name: string; source: string; verified: 'outline' | 'content' };

export type PlayerInfo = { id: string; name: string; score: number; connected: boolean };

/** Server-side game state machine */
export type Phase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'QUESTION_ACTIVE'
  | 'QUESTION_RESULTS'
  | 'LEADERBOARD'
  | 'GAME_FINISHED';

export type Timing = { countdownMs: number; resultsMs: number; leaderboardMs: number };

export type Reveal = {
  correct: number;
  counts: number[];
  unanswered: number;
  eligible: number;
  explanation?: string;
  keyConcept?: string;
  commonMistake?: string;
};

/** What the host screen receives */
export type HostState = {
  pin: string;
  sessionId: string;
  title: string;
  phase: Phase;
  paused: boolean;
  /** server clock: clients compute offset = serverNow - Date.now() */
  serverNow: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  timing: Timing;
  players: PlayerInfo[];
  index: number;
  total: number;
  question?: Omit<Question, 'misconceptions'>;
  answeredCount: number;
  eligibleCount: number;
  reveal?: Reveal;
  leaderboard?: PlayerInfo[];
};

/** What a player's phone receives */
export type PlayerState = {
  pin: string;
  name: string;
  phase: Phase;
  paused: boolean;
  serverNow: number;
  phaseEndsAt: number | null;
  index: number;
  total: number;
  eligible: boolean;
  question?: { text: string; answers: string[]; code?: string; codeLang?: string };
  answered: boolean;
  lastResult?: {
    status: 'correct' | 'incorrect' | 'unanswered' | 'not_eligible';
    points: number;
    correctAnswer: string;
    explanation?: string;
    keyConcept?: string;
  };
  score: number;
  rank: number;
  playerCount: number;
};

export type Ack<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

// ---------- Persistence ----------
export type AttemptStatus = 'correct' | 'incorrect' | 'unanswered';

export type QuestionAttempt = {
  sessionId: string;
  participantId: string;
  questionId: string;
  questionIndex: number;
  selectedOption: number | null;
  status: AttemptStatus;
  isCorrect: boolean;
  responseTimeMs: number | null;
  timeLimitMs: number;
  scoreAwarded: number;
  topicId: string | null;
  courseId: string | null;
  difficulty: Difficulty | null;
  submittedAt: number | null;
  timedOut: boolean;
};

export type ParticipantRecord = {
  id: string;
  nickname: string;
  joinedAt: number;
  joinedAtQuestion: number; // first question index they were eligible for
  finalScore: number;
  finalRank: number;
};

export type GameSessionRecord = {
  id: string;
  pin: string;
  title: string;
  quiz: Quiz;
  startedAt: number | null;
  finishedAt: number | null;
  status: 'lobby' | 'running' | 'finished' | 'abandoned';
  demo?: boolean;
  participants: ParticipantRecord[];
  /** eligible participant ids per question index */
  eligibility: Record<number, string[]>;
  attempts: QuestionAttempt[];
};
