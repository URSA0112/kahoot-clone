import { randomUUID } from 'node:crypto';
import type { GameSessionRecord, QuestionAttempt } from '../shared/types.js';
import { CURRICULUM_QUIZ } from '../shared/curriculum.js';

/**
 * DEMO data generator — clearly flagged `demo: true` and shown with a "ДЕМО" badge.
 * Used only to preview the dashboard before a real class session; never mixed with real data.
 */
export function makeDemoSession(players = 12): GameSessionRecord {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const names = ['Demo-Бат', 'Demo-Сараа', 'Demo-Тэмүүлэн', 'Demo-Номин', 'Demo-Анар', 'Demo-Билгүүн', 'Demo-Хулан', 'Demo-Мөнх', 'Demo-Оюу', 'Demo-Тэнгис', 'Demo-Ану', 'Demo-Ганаа', 'Demo-Дулмаа', 'Demo-Эрдэнэ'];
  const id = randomUUID();
  const start = Date.now() - 30 * 60_000;
  const quiz = CURRICULUM_QUIZ;
  const participants = Array.from({ length: players }, (_, i) => ({
    id: randomUUID(),
    nickname: names[i % names.length],
    joinedAt: start,
    joinedAtQuestion: i === players - 1 ? 3 : 0, // one late joiner
    finalScore: 0,
    finalRank: 0,
    skill: 0.35 + rnd() * 0.55,
  }));
  const eligibility: Record<number, string[]> = {};
  const attempts: QuestionAttempt[] = [];
  quiz.questions.forEach((q, qi) => {
    const hard = q.difficulty === 'advanced' ? 0.25 : q.difficulty === 'intermediate' ? 0.1 : 0;
    const elig = participants.filter((p) => p.joinedAtQuestion <= qi);
    eligibility[qi] = elig.map((p) => p.id);
    const commonWrong = [0, 1, 2, 3].filter((o) => o !== q.correct)[Math.floor(rnd() * 3)];
    for (const p of elig) {
      const limit = q.time * 1000;
      const r = rnd();
      const unanswered = r < 0.05;
      const correct = !unanswered && rnd() < p.skill - hard;
      const choice = unanswered ? null : correct ? q.correct : rnd() < 0.6 ? commonWrong : [0, 1, 2, 3].filter((o) => o !== q.correct)[Math.floor(rnd() * 3)];
      const rt = unanswered ? null : Math.round(limit * (0.2 + rnd() * 0.7));
      const pts = correct && rt !== null ? Math.round(1000 * (1 - rt / limit / 2)) : 0;
      p.finalScore += pts;
      attempts.push({
        sessionId: id, participantId: p.id, questionId: q.id!, questionIndex: qi, selectedOption: choice,
        status: unanswered ? 'unanswered' : correct ? 'correct' : 'incorrect', isCorrect: correct,
        responseTimeMs: rt, timeLimitMs: limit, scoreAwarded: pts, topicId: q.topicId ?? null, courseId: q.courseId ?? null,
        difficulty: q.difficulty ?? null, submittedAt: rt !== null ? start + qi * 60_000 + rt : null, timedOut: unanswered,
      });
    }
  });
  [...participants].sort((a, b) => b.finalScore - a.finalScore).forEach((p, i) => (p.finalRank = i + 1));
  return {
    id, pin: 'DEMO', title: 'ДЕМО өгөгдөл · ' + quiz.title, quiz, startedAt: start, finishedAt: start + 25 * 60_000,
    status: 'finished', demo: true,
    participants: participants.map(({ skill: _s, ...p }) => p),
    eligibility, attempts,
  };
}
