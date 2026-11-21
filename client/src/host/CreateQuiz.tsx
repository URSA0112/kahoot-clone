import { useState } from 'react';
import type { Question, Quiz } from '../../../shared/types';
import { useStore } from '../store';
import { emitAck } from '../socket';
import { Button, COLORS, Shape } from '../components/ui';

const SAMPLE: Quiz = {
  title: 'Монгол улсын тухай',
  questions: [
    { text: 'Монгол улсын нийслэл аль хот вэ?', answers: ['Дархан', 'Улаанбаатар', 'Эрдэнэт', 'Ховд'], correct: 1, time: 20 },
    { text: 'Их Монгол улсыг хэдэн онд байгуулсан бэ?', answers: ['1206', '1911', '1921', '1162'], correct: 0, time: 20 },
    { text: 'Монголын хамгийн өндөр уул аль нь вэ?', answers: ['Отгонтэнгэр', 'Сутай', 'Хүйтэн оргил', 'Цамбагарав'], correct: 2, time: 20 },
    { text: 'Хөвсгөл нуур аймгийн нэр юу вэ?', answers: ['Завхан', 'Булган', 'Сэлэнгэ', 'Хөвсгөл'], correct: 3, time: 15 },
  ],
};

const emptyQ = (): Question => ({ text: '', answers: ['', '', '', ''], correct: 0, time: 20 });

export default function CreateQuiz() {
  const setView = useStore((s) => s.setView);
  const [quiz, setQuiz] = useState<Quiz>(SAMPLE);
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [lang, setLang] = useState('Mongolian');
  const [busy, setBusy] = useState<'ai' | 'start' | null>(null);
  const [error, setError] = useState('');
  const [timing, setTiming] = useState({ resultsS: 8, leaderboardS: 5, countdownS: 3 });

  const timingMs = () => ({
    resultsMs: timing.resultsS * 1000,
    leaderboardMs: timing.leaderboardS * 1000,
    countdownMs: timing.countdownS * 1000,
  });

  async function launch(payload: object) {
    setError('');
    setBusy('start');
    try {
      const { pin, hostKey } = await emitAck<{ pin: string; hostKey: string }>('host:create', { ...payload, timing: timingMs() });
      sessionStorage.setItem('hostPin', pin);
      sessionStorage.setItem('hostKey', hostKey);
      setView('host');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const updateQ = (i: number, patch: Partial<Question>) =>
    setQuiz((q) => ({ ...q, questions: q.questions.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  async function generate() {
    if (!topic.trim()) return setError('Сэдвээ бичнэ үү');
    setError('');
    setBusy('ai');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, count, language: lang, time: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI алдаа');
      setQuiz(data);
    } catch (e) {
      setError('Gemini: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    const bad = quiz.questions.findIndex((q) => !q.text.trim() || q.answers.some((a) => !a.trim()));
    if (bad >= 0) return setError(`${bad + 1}-р асуулт дутуу байна`);
    launch({ quiz });
  }

  return (
    <div className="max-w-3xl mx-auto p-4 pb-32 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button className="text-white/70 hover:text-white cursor-pointer" onClick={() => setView('home')}>
          ← Буцах
        </button>
        <h2 className="font-black text-2xl">Quiz үүсгэх</h2>
        <span />
      </div>

      {/* Curriculum preset */}
      <section className="bg-white text-gray-900 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 shadow-xl">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-k-purple">PIAcademy · сургалтын хөтөлбөр</p>
          <h3 className="font-black text-xl">Програмчлалын үндэс + Вэб хөгжүүлэлт</h3>
          <p className="text-sm text-gray-600">
            20 асуулт (C 10, Web 10) · код уншиж бодох асуултууд · тайлбар, гол ойлголт · багшийн тайлан
          </p>
        </div>
        <Button className="!bg-k-purple !text-white !shadow-[0_4px_0_#2d0b63]" disabled={busy !== null} onClick={() => launch({ preset: 'piacademy' })}>
          Энэ quiz-ээр эхлэх ▶
        </Button>
      </section>

      {/* Auto-flow timing */}
      <section className="bg-white/10 rounded-xl p-4 border border-white/20">
        <h3 className="font-bold mb-2">⏱ Автомат урсгалын хугацаа (секунд)</h3>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {(
            [
              ['resultsS', 'Зөв хариулт + тайлбар', [5, 8, 10, 15, 20]],
              ['leaderboardS', 'Тэргүүлэгчид', [3, 5, 8, 10]],
              ['countdownS', '3-2-1 тоолол', [3, 5]],
            ] as const
          ).map(([k, label, opts]) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-white/80">{label}</span>
              <select className="rounded-md p-2 text-gray-900 font-semibold" value={timing[k]} onChange={(e) => setTiming({ ...timing, [k]: +e.target.value })}>
                {opts.map((n) => (
                  <option key={n} value={n}>{n}с</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <p className="text-center text-white/60 text-sm">— эсвэл өөрийн quiz —</p>

      {/* AI generator */}
      <section className="bg-white/10 rounded-xl p-4 flex flex-col gap-3 border border-white/20">
        <h3 className="font-bold">✨ Gemini AI-аар асуулт үүсгэх</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 rounded-md p-3 text-gray-900 font-semibold"
            placeholder="Сэдэв: жишээ нь 'JavaScript үндэс', 'Чингис хаан'"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <select className="rounded-md p-3 text-gray-900 font-semibold" value={count} onChange={(e) => setCount(+e.target.value)}>
            {[3, 5, 8, 10, 15].map((n) => (
              <option key={n} value={n}>{n} асуулт</option>
            ))}
          </select>
          <select className="rounded-md p-3 text-gray-900 font-semibold" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="Mongolian">Монгол</option>
            <option value="English">English</option>
          </select>
          <Button onClick={generate} disabled={busy !== null}>
            {busy === 'ai' ? 'Үүсгэж байна…' : 'Үүсгэх'}
          </Button>
        </div>
      </section>

      <input
        className="bg-transparent border-b-2 border-white/40 text-3xl font-black outline-none p-2 focus:border-white"
        value={quiz.title}
        onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
        placeholder="Quiz-ийн нэр"
      />

      {quiz.questions.map((q, i) => (
        <section key={i} className="bg-white text-gray-900 rounded-xl p-4 flex flex-col gap-3 shadow-lg">
          <div className="flex items-center gap-2">
            <span className="font-black text-k-purple">{i + 1}.</span>
            <input
              className="flex-1 font-bold text-lg border-b-2 border-gray-200 outline-none focus:border-k-purple p-1"
              value={q.text}
              placeholder="Асуулт"
              onChange={(e) => updateQ(i, { text: e.target.value })}
            />
            <select
              className="border rounded p-1 text-sm"
              value={q.time}
              onChange={(e) => updateQ(i, { time: +e.target.value })}
            >
              {[5, 10, 15, 20, 30, 45, 60].map((t) => (
                <option key={t} value={t}>{t}с</option>
              ))}
            </select>
            <button
              className="text-gray-400 hover:text-k-red px-2 cursor-pointer"
              title="Устгах"
              disabled={quiz.questions.length === 1}
              onClick={() => setQuiz({ ...quiz, questions: quiz.questions.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {q.answers.map((a, j) => (
              <label key={j} className={`${COLORS[j]} rounded-md flex items-center gap-2 p-2`}>
                <Shape i={j} className="w-5 h-5 shrink-0" />
                <input
                  className="flex-1 bg-transparent text-white font-semibold placeholder-white/60 outline-none"
                  value={a}
                  placeholder={`Хариулт ${j + 1}`}
                  onChange={(e) => {
                    const answers = [...q.answers] as Question['answers'];
                    answers[j] = e.target.value;
                    updateQ(i, { answers });
                  }}
                />
                <input
                  type="radio"
                  name={`correct-${i}`}
                  className="w-5 h-5 accent-white"
                  checked={q.correct === j}
                  onChange={() => updateQ(i, { correct: j })}
                  title="Зөв хариулт"
                />
              </label>
            ))}
          </div>
        </section>
      ))}

      <Button variant="ghost" onClick={() => setQuiz({ ...quiz, questions: [...quiz.questions, emptyQ()] })}>
        + Асуулт нэмэх
      </Button>

      <div className="fixed bottom-0 inset-x-0 bg-k-purple/95 backdrop-blur p-4 flex items-center justify-center gap-4 border-t border-white/20">
        {error && <span className="text-yellow-300 font-semibold text-sm">{error}</span>}
        <Button onClick={start} disabled={busy !== null} className="text-lg">
          {busy === 'start' ? '...' : `Тоглоом эхлүүлэх (${quiz.questions.length} асуулт) ▶`}
        </Button>
      </div>
    </div>
  );
}
