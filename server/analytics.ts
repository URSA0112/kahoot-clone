import type { GameSessionRecord, Question, QuestionAttempt } from '../shared/types.js';
import { COURSES, TOPICS } from '../shared/curriculum.js';

/**
 * Learning analytics — always recomputed from raw QuestionAttempt records.
 *
 * Formulas (E = eligible participant-question pairs; every eligible pair has exactly one attempt
 * whose status is correct | incorrect | unanswered):
 *   Question accuracy   = correct_q / eligible_q × 100          (unanswered stay IN the denominator)
 *   Topic accuracy      = Σ correct in topic / Σ eligible attempts in topic × 100
 *   Course accuracy     = Σ correct in course / Σ eligible attempts in course × 100
 *   Student accuracy    = correct_s / questions the student was eligible for × 100
 *   Participation rate  = answered (correct + incorrect) / eligible attempts × 100
 *   Completion rate     = participants eligible for the final question / all participants × 100
 *   Avg response time   = mean(responseTimeMs) over ANSWERED attempts only (unanswered have none)
 *   Option distribution = count of each selected option / eligible_q (unanswered shown separately)
 * Gameplay score (speed-weighted) is reported separately and never used for learning labels.
 */

export type Label = 'strong' | 'practice' | 'review' | 'insufficient';
export const LABEL_TEXT: Record<Label, string> = {
  strong: 'Шалгасан асуултууд дээр сайн гүйцэтгэлтэй',
  practice: 'Нэмэлт дасгал хэрэгтэй',
  review: 'Сэдвийг давтах шаардлагатай',
  insufficient: 'Нотолгоо хангалтгүй',
};

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

function label(accuracy: number | null, nQuestions: number, minQuestions: number): Label {
  if (accuracy === null || nQuestions < minQuestions) return 'insufficient';
  if (accuracy >= 80) return 'strong';
  if (accuracy >= 50) return 'practice';
  return 'review';
}

type Agg = { eligible: number; correct: number; incorrect: number; unanswered: number; times: number[] };
const emptyAgg = (): Agg => ({ eligible: 0, correct: 0, incorrect: 0, unanswered: 0, times: [] });
function add(a: Agg, t: QuestionAttempt) {
  a.eligible++;
  a[t.status]++;
  if (t.responseTimeMs !== null) a.times.push(t.responseTimeMs);
}
const summarize = (a: Agg) => ({
  eligible: a.eligible,
  correct: a.correct,
  incorrect: a.incorrect,
  unanswered: a.unanswered,
  accuracy: pct(a.correct, a.eligible),
  participation: pct(a.correct + a.incorrect, a.eligible),
  avgResponseMs: mean(a.times),
});

export function buildReport(s: GameSessionRecord) {
  const qs = s.quiz.questions;
  const qid = (q: Question, i: number) => q.id ?? `Q${String(i + 1).padStart(2, '0')}`;
  const topicName = (id: string | null) => TOPICS.find((t) => t.id === id)?.name ?? id ?? 'Ангилаагүй';
  const courseName = (id: string | null) => COURSES.find((c) => c.id === id)?.name ?? id ?? 'Ангилаагүй';
  // ----- integrity checks -----
  const seen = new Set<string>();
  let duplicates = 0;
  for (const a of s.attempts) {
    const k = `${a.participantId}|${a.questionIndex}`;
    if (seen.has(k)) duplicates++;
    seen.add(k);
  }
  const expected = Object.values(s.eligibility).reduce((n, ids) => n + ids.length, 0);

  // ----- questions -----
  const questions = qs.map((q, i) => {
    const atts = s.attempts.filter((a) => a.questionIndex === i);
    const agg = emptyAgg();
    atts.forEach((a) => add(agg, a));
    const optionCounts = [0, 1, 2, 3].map((o) => atts.filter((a) => a.selectedOption === o).length);
    const wrong = optionCounts
      .map((c, o) => ({ o, c }))
      .filter((x) => x.o !== q.correct && x.c > 0)
      .sort((a, b) => b.c - a.c)[0];
    return {
      index: i,
      id: qid(q, i),
      text: q.text,
      code: q.code,
      answers: q.answers,
      correctIndex: q.correct,
      correctAnswer: q.answers[q.correct],
      explanation: q.explanation,
      topicId: q.topicId ?? null,
      topic: topicName(q.topicId ?? null),
      courseId: q.courseId ?? null,
      course: courseName(q.courseId ?? null),
      difficulty: q.difficulty ?? null,
      asked: s.eligibility[i] !== undefined,
      ...summarize(agg),
      optionCounts,
      topWrong: wrong
        ? { option: wrong.o, answer: q.answers[wrong.o], count: wrong.c, share: pct(wrong.c, agg.eligible), misconception: q.misconceptions?.[wrong.o] ?? null }
        : null,
    };
  });

  // ----- topics & courses -----
  const byTopic = new Map<string, Agg & { questions: Set<number> }>();
  const byCourse = new Map<string, Agg & { questions: Set<number> }>();
  for (const a of s.attempts) {
    const t = a.topicId ?? 'none';
    const c = a.courseId ?? 'none';
    if (!byTopic.has(t)) byTopic.set(t, Object.assign(emptyAgg(), { questions: new Set<number>() }));
    if (!byCourse.has(c)) byCourse.set(c, Object.assign(emptyAgg(), { questions: new Set<number>() }));
    add(byTopic.get(t)!, a);
    byTopic.get(t)!.questions.add(a.questionIndex);
    add(byCourse.get(c)!, a);
    byCourse.get(c)!.questions.add(a.questionIndex);
  }
  const topics = [...byTopic.entries()]
    .map(([id, a]) => {
      const sum = summarize(a);
      const nQ = a.questions.size;
      const studentsNeedingPractice = s.participants
        .map((p) => {
          const mine = s.attempts.filter((x) => x.participantId === p.id && (x.topicId ?? 'none') === id);
          const c = mine.filter((x) => x.isCorrect).length;
          return { id: p.id, nickname: p.nickname, correct: c, total: mine.length };
        })
        .filter((x) => x.total > 0 && x.correct / x.total < 0.5);
      const wrongCounts = new Map<string, number>();
      for (const qi of a.questions) {
        const q = questions[qi];
        if (q.topWrong?.misconception) wrongCounts.set(q.topWrong.misconception, (wrongCounts.get(q.topWrong.misconception) ?? 0) + q.topWrong.count);
      }
      return {
        id,
        name: topicName(id === 'none' ? null : id),
        courseId: TOPICS.find((t) => t.id === id)?.courseId ?? null,
        questions: nQ,
        responses: a.eligible,
        ...sum,
        label: label(sum.accuracy, nQ, 2),
        singleQuestion: nQ === 1,
        commonMisconceptions: [...wrongCounts.entries()].sort((x, y) => y[1] - x[1]).map(([m, n]) => ({ misconception: m, count: n })),
        studentsNeedingPractice,
      };
    })
    .sort((x, y) => (x.accuracy ?? 0) - (y.accuracy ?? 0));

  const courses = [...byCourse.entries()].map(([id, a]) => ({
    id,
    name: courseName(id === 'none' ? null : id),
    questions: a.questions.size,
    ...summarize(a),
  }));

  // ----- students -----
  const lastIdx = Math.max(-1, ...Object.keys(s.eligibility).map(Number));
  const students = s.participants
    .map((p) => {
      const mine = s.attempts.filter((a) => a.participantId === p.id);
      const agg = emptyAgg();
      mine.forEach((a) => add(agg, a));
      const perCourse = COURSES.map((c) => {
        const xs = mine.filter((a) => a.courseId === c.id);
        return { courseId: c.id, name: c.name, total: xs.length, correct: xs.filter((x) => x.isCorrect).length, accuracy: pct(xs.filter((x) => x.isCorrect).length, xs.length) };
      }).filter((x) => x.total > 0);
      const topicIds = [...new Set(mine.map((a) => a.topicId ?? 'none'))];
      const perTopic = topicIds.map((t) => {
        const xs = mine.filter((a) => (a.topicId ?? 'none') === t);
        const c = xs.filter((x) => x.isCorrect).length;
        const acc = pct(c, xs.length);
        return { topicId: t, name: topicName(t === 'none' ? null : t), total: xs.length, correct: c, accuracy: acc, label: label(acc, xs.length, 2) };
      });
      return {
        id: p.id,
        nickname: p.nickname,
        rank: p.finalRank,
        score: p.finalScore,
        ...summarize(agg),
        eligibleQuestions: agg.eligible,
        perCourse,
        perTopic,
        history: mine
          .sort((a, b) => a.questionIndex - b.questionIndex)
          .map((a) => ({ questionIndex: a.questionIndex, questionId: a.questionId, status: a.status, selectedOption: a.selectedOption, responseTimeMs: a.responseTimeMs, scoreAwarded: a.scoreAwarded })),
        completed: (s.eligibility[lastIdx] ?? []).includes(p.id),
      };
    })
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  // ----- overview -----
  const all = emptyAgg();
  s.attempts.forEach((a) => add(all, a));
  const assessedTopics = topics.filter((t) => t.id !== 'none' && t.accuracy !== null);
  const multi = assessedTopics.filter((t) => t.questions >= 2);
  const pool = multi.length ? multi : assessedTopics;
  const overview = {
    participants: s.participants.length,
    questions: qs.length,
    questionsAsked: Object.keys(s.eligibility).length,
    submittedAnswers: all.correct + all.incorrect,
    eligibleAttempts: all.eligible,
    ...summarize(all),
    completionRate: pct(students.filter((x) => x.completed).length, s.participants.length),
    hardestTopic: pool.length ? pool.reduce((a, b) => ((b.accuracy ?? 0) < (a.accuracy ?? 0) ? b : a)) : null,
    strongestTopic: pool.length ? pool.reduce((a, b) => ((b.accuracy ?? 0) > (a.accuracy ?? 0) ? b : a)) : null,
  };

  // ----- recommendations (learning signals, not diagnoses) -----
  const recs: { level: 'high' | 'medium' | 'info'; text: string }[] = [];
  for (const t of topics) {
    if (t.id === 'none' || t.accuracy === null) continue;
    const n = `(${t.questions} асуулт, ${t.responses} хариулт)`;
    if (t.accuracy < 50)
      recs.push({ level: 'high', text: `"${t.name}" сэдвийн асуултуудад алдаа их гарсан тул дахин тайлбарлах шаардлагатай байж болно. Зөв хариултын хувь ${t.accuracy}% ${n}.${t.singleQuestion ? ' Энэ дүгнэлт ганц асуултад тулгуурласан.' : ''}` });
    else if (t.accuracy < 80)
      recs.push({ level: 'medium', text: `"${t.name}" ойлголтыг бататгах нэмэлт дасгал санал болгож байна. Зөв хариултын хувь ${t.accuracy}% ${n}.` });
  }
  for (const q of questions) {
    if (q.topWrong && q.topWrong.share !== null && q.topWrong.share >= 30 && q.topWrong.count >= 2)
      recs.push({ level: 'medium', text: `${q.id}: олон сурагч (${q.topWrong.count} хүн, ${q.topWrong.share}%) ижил буруу сонголт "${q.topWrong.answer}"-ийг сонгосон.${q.topWrong.misconception ? ` Магадгүй: ${q.topWrong.misconception}.` : ''}` });
    if (q.asked && q.participation !== null && q.participation < 60)
      recs.push({ level: 'info', text: `${q.id}: олон сурагч хугацаандаа хариулж амжаагүй (${q.unanswered} хүн). Хугацааг уртасгах эсвэл асуултыг хялбарчлах хэрэгтэй эсэхийг шалгаарай.` });
  }

  // ----- coverage -----
  const assessedIds = new Set(qs.map((q) => q.topicId).filter(Boolean));
  const coverage = TOPICS.map((t) => ({
    ...t,
    course: courseName(t.courseId),
    assessed: assessedIds.has(t.id),
    questionIds: qs.map((q, i) => (q.topicId === t.id ? qid(q, i) : null)).filter(Boolean),
  }));

  return {
    session: { id: s.id, pin: s.pin, title: s.title, startedAt: s.startedAt, finishedAt: s.finishedAt, status: s.status, demo: !!s.demo },
    integrity: { attempts: s.attempts.length, expectedAttempts: expected, duplicates, ok: duplicates === 0 && expected === s.attempts.length },
    overview,
    courses,
    topics,
    questions,
    students,
    recommendations: recs,
    coverage,
    labels: LABEL_TEXT,
  };
}

export type Report = ReturnType<typeof buildReport>;

export function attemptsCsv(s: GameSessionRecord) {
  const nick = new Map(s.participants.map((p) => [p.id, p.nickname]));
  const esc = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ['session_id', 'participant_id', 'nickname', 'question_index', 'question_id', 'course_id', 'topic_id', 'difficulty', 'selected_option', 'selected_answer', 'correct_answer', 'status', 'is_correct', 'response_time_ms', 'time_limit_ms', 'score_awarded', 'timed_out', 'submitted_at'];
  const rows = s.attempts.map((a) => {
    const q = s.quiz.questions[a.questionIndex];
    return [a.sessionId, a.participantId, nick.get(a.participantId), a.questionIndex + 1, a.questionId, a.courseId, a.topicId, a.difficulty, a.selectedOption, a.selectedOption !== null ? q?.answers[a.selectedOption] : '', q?.answers[q.correct], a.status, a.isCorrect, a.responseTimeMs, a.timeLimitMs, a.scoreAwarded, a.timedOut, a.submittedAt ? new Date(a.submittedAt).toISOString() : ''].map(esc).join(',');
  });
  return '﻿' + [head.join(','), ...rows].join('\n');
}
