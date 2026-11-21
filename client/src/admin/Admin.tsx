import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Report } from '../../../server/analytics';
import { useStore } from '../store';

// ---------------- api ----------------
const tokenKey = 'adminToken';
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem(tokenKey) ?? ''}`, ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    sessionStorage.removeItem(tokenKey);
    throw new Error('401');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText);
  return res.json();
}

type SessionSummary = {
  id: string; title: string; pin: string; status: string; demo: boolean;
  startedAt: number | null; finishedAt: number | null; participants: number; questions: number; asked: number;
};

const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleString('mn-MN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);
const fmtSec = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}с`);
const DIFF: Record<string, string> = { foundational: 'Суурь', intermediate: 'Дунд', advanced: 'Ахисан' };
const accColor = (v: number | null) => (v === null ? 'bg-gray-300' : v >= 80 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-400' : 'bg-rose-500');
const LABEL_STYLE: Record<string, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  practice: 'bg-amber-100 text-amber-800',
  review: 'bg-rose-100 text-rose-800',
  insufficient: 'bg-gray-100 text-gray-600',
};

// ---------------- root ----------------
export default function Admin() {
  const setView = useStore((s) => s.setView);
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(tokenKey));
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 overflow-auto bg-slate-50 text-slate-900 font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <button className="font-black text-k-purple text-xl cursor-pointer" onClick={() => setView('home')}>QUIZ!</button>
          <span className="text-slate-400">/</span>
          <button className="font-semibold cursor-pointer" onClick={() => setOpenId(null)}>Багшийн самбар</button>
          <span className="flex-1" />
          {authed && (
            <button
              className="text-sm text-slate-500 hover:text-slate-900 cursor-pointer"
              onClick={() => {
                sessionStorage.removeItem(tokenKey);
                setAuthed(false);
              }}
            >
              Гарах
            </button>
          )}
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        {!authed ? (
          <Login onDone={() => setAuthed(true)} />
        ) : openId ? (
          <ReportView id={openId} onUnauthorized={() => setAuthed(false)} />
        ) : (
          <SessionList onOpen={setOpenId} onUnauthorized={() => setAuthed(false)} />
        )}
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <form
      className="max-w-sm mx-auto mt-20 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        try {
          const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          sessionStorage.setItem(tokenKey, d.token);
          onDone();
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    >
      <h2 className="text-xl font-bold">Багшийн нэвтрэлт</h2>
      <p className="text-sm text-slate-500">Сурагчдын дүн зөвхөн нууц үгтэй багшид харагдана. Game PIN мэдэх нь хангалтгүй.</p>
      <input type="password" autoFocus className="border border-slate-300 rounded-md p-2.5" placeholder="Нууц үг" value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="bg-slate-900 text-white rounded-md p-2.5 font-semibold cursor-pointer">Нэвтрэх</button>
      {err && <p className="text-rose-600 text-sm">{err}</p>}
    </form>
  );
}

function SessionList({ onOpen, onUnauthorized }: { onOpen: (id: string) => void; onUnauthorized: () => void }) {
  const [list, setList] = useState<SessionSummary[] | null>(null);
  const [err, setErr] = useState('');
  const load = () =>
    api<SessionSummary[]>('/api/admin/sessions')
      .then(setList)
      .catch((e) => (e.message === '401' ? onUnauthorized() : setErr(e.message)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold flex-1">Тоглоомын сессүүд</h1>
        <button
          className="text-sm border border-slate-300 rounded-md px-3 py-2 hover:bg-white cursor-pointer"
          onClick={async () => {
            const { id } = await api<{ id: string }>('/api/admin/demo', { method: 'POST' });
            onOpen(id);
          }}
        >
          + ДЕМО өгөгдөл үүсгэх
        </button>
      </div>
      {err && <p className="text-rose-600">{err}</p>}
      {!list ? (
        <p className="text-slate-500">Ачаалж байна…</p>
      ) : list.length === 0 ? (
        <Empty>Одоогоор тоглосон сесс алга. Тоглоом дууссаны дараа энд тайлан гарна. Самбарыг урьдчилж харах бол ДЕМО өгөгдөл үүсгээрэй.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 bg-slate-50">
              <tr>
                <Th>Огноо</Th><Th>Quiz</Th><Th>Оролцогч</Th><Th>Асуулт</Th><Th>Төлөв</Th><Th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(s.id)}>
                  <Td>{fmtDate(s.startedAt)}</Td>
                  <Td>
                    {s.demo && <Badge className="bg-violet-100 text-violet-700 mr-2">ДЕМО</Badge>}
                    {s.title}
                  </Td>
                  <Td>{s.participants}</Td>
                  <Td>{s.asked}/{s.questions}</Td>
                  <Td>{s.status === 'finished' ? 'Дууссан' : s.status === 'running' ? 'Явагдаж буй' : 'Тасалдсан'}</Td>
                  <Td className="text-k-purple font-semibold">Тайлан →</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ---------------- report ----------------
const TABS = ['Тойм', 'Курс', 'Сэдэв', 'Асуулт', 'Сурагч', 'Матриц', 'Тайлан'] as const;
type Tab = (typeof TABS)[number];

function ReportView({ id, onUnauthorized }: { id: string; onUnauthorized: () => void }) {
  const [r, setR] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>('Тойм');
  const [student, setStudent] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Report>(`/api/admin/sessions/${id}`)
      .then(setR)
      .catch((e) => (e.message === '401' ? onUnauthorized() : setErr(e.message)));
  }, [id, onUnauthorized]);
  if (err) return <p className="text-rose-600">{err}</p>;
  if (!r) return <p className="text-slate-500">Тооцоолж байна…</p>;

  const csv = () => {
    fetch(`/api/admin/sessions/${id}/csv`, { headers: { Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}` } })
      .then((x) => x.blob())
      .then((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `quiz-${id.slice(0, 8)}.csv`;
        a.click();
      });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-64">
          <h1 className="text-2xl font-bold">
            {r.session.demo && <Badge className="bg-violet-100 text-violet-700 mr-2 align-middle">ДЕМО өгөгдөл</Badge>}
            {r.session.title}
          </h1>
          <p className="text-sm text-slate-500">
            {fmtDate(r.session.startedAt)} · PIN {r.session.pin} · {r.overview.participants} оролцогч · {r.overview.questionsAsked}/{r.overview.questions} асуулт
            {!r.integrity.ok && <span className="text-rose-600"> · ⚠ өгөгдлийн бүрэн бүтэн байдлын шалгалт амжилтгүй</span>}
          </p>
        </div>
        <button className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white hover:bg-slate-50 cursor-pointer" onClick={csv}>
          ⬇ CSV
        </button>
        <button className="text-sm border border-slate-300 rounded-md px-3 py-2 bg-white hover:bg-slate-50 cursor-pointer" onClick={() => { setTab('Тайлан'); setTimeout(() => window.print(), 100); }}>
          🖨 Хэвлэх
        </button>
      </div>
      <nav className="flex gap-1 border-b border-slate-200 overflow-x-auto print:hidden">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setStudent(null); }}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap cursor-pointer ${tab === t ? 'border-k-purple text-k-purple' : 'border-transparent text-slate-500 hover:text-slate-900'}`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === 'Тойм' && <Overview r={r} />}
      {tab === 'Курс' && <Courses r={r} />}
      {tab === 'Сэдэв' && <Topics r={r} />}
      {tab === 'Асуулт' && <Questions r={r} />}
      {tab === 'Сурагч' && (student ? <StudentDetail r={r} id={student} onBack={() => setStudent(null)} /> : <Students r={r} onOpen={setStudent} />)}
      {tab === 'Матриц' && <Matrix r={r} />}
      {tab === 'Тайлан' && <FullReport r={r} />}
    </div>
  );
}

function Overview({ r }: { r: Report }) {
  const o = r.overview;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Оролцогч" value={o.participants} />
        <Kpi label="Асуулт" value={`${o.questionsAsked}/${o.questions}`} />
        <Kpi label="Илгээсэн хариулт" value={o.submittedAnswers} sub={`${o.eligibleAttempts} боломжит хариултаас`} />
        <Kpi label="Зөв хариултын хувь" value={fmtPct(o.accuracy)} sub="зөв / боломжит (хариулаагүйг оруулсан)" accent />
        <Kpi label="Хариулаагүй" value={o.unanswered} sub={`Оролцоо ${fmtPct(o.participation)}`} />
        <Kpi label="Дундаж хариултын хугацаа" value={fmtSec(o.avgResponseMs)} sub="хариулсан тохиолдлоор" />
        <Kpi label="Эцсийн асуулт хүртэл үлдсэн" value={fmtPct(o.completionRate)} />
        <Kpi label="Хамрагдсан сэдэв" value={`${r.coverage.filter((c) => c.assessed).length}/${r.coverage.length}`} sub="хөтөлбөрийн сэдвүүдээс шалгагдсан нь" />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <p className="text-sm text-slate-500">Хамгийн хүндрэлтэй сэдэв</p>
          {o.hardestTopic ? (
            <p className="text-lg font-bold">
              {o.hardestTopic.name} <span className="text-rose-600">{fmtPct(o.hardestTopic.accuracy)}</span>
              <span className="text-sm text-slate-500 font-normal"> · {o.hardestTopic.questions} асуулт, {o.hardestTopic.responses} хариулт</span>
            </p>
          ) : <p>—</p>}
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Хамгийн сайн гүйцэтгэсэн сэдэв</p>
          {o.strongestTopic ? (
            <p className="text-lg font-bold">
              {o.strongestTopic.name} <span className="text-emerald-600">{fmtPct(o.strongestTopic.accuracy)}</span>
              <span className="text-sm text-slate-500 font-normal"> · {o.strongestTopic.questions} асуулт, {o.strongestTopic.responses} хариулт</span>
            </p>
          ) : <p>—</p>}
        </Card>
      </div>
      <Recs r={r} limit={5} />
      <Note>
        20 асуулттай нэг тест бол хязгаарлагдмал нотолгоо. Эдгээр тоо нь сурагчийн бүх мэдлэг, чадварыг бус, зөвхөн энэ удаагийн асуултууд дээрх гүйцэтгэлийг харуулна.
        Тоглоомын оноо (хурдыг шагнадаг) болон сургалтын үнэлгээ (зөв эсэх) тусдаа тооцогдоно.
      </Note>
    </div>
  );
}

function Courses({ r }: { r: Report }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {r.courses.map((c) => (
        <Card key={c.id}>
          <h3 className="font-bold text-lg">{c.name}</h3>
          <p className="text-sm text-slate-500 mb-3">{c.questions} асуулт · {c.eligible} боломжит хариулт</p>
          <p className="text-4xl font-black mb-3">{fmtPct(c.accuracy)}</p>
          <Stacked correct={c.correct} incorrect={c.incorrect} unanswered={c.unanswered} />
          <dl className="grid grid-cols-2 gap-y-1 text-sm mt-4">
            <dt className="text-slate-500">Зөв</dt><dd className="font-semibold">{c.correct}</dd>
            <dt className="text-slate-500">Буруу</dt><dd className="font-semibold">{c.incorrect}</dd>
            <dt className="text-slate-500">Хариулаагүй</dt><dd className="font-semibold">{c.unanswered}</dd>
            <dt className="text-slate-500">Дундаж хугацаа</dt><dd className="font-semibold">{fmtSec(c.avgResponseMs)}</dd>
          </dl>
        </Card>
      ))}
      <Card className="md:col-span-2">
        <h3 className="font-bold mb-3">Харьцуулалт: зөв хариултын хувь</h3>
        {r.courses.map((c) => (
          <HBar key={c.id} label={c.name} value={c.accuracy} right={`${c.correct}/${c.eligible}`} />
        ))}
      </Card>
    </div>
  );
}

function Topics({ r }: { r: Report }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h3 className="font-bold mb-1">Сэдэв тус бүрийн ойлголт</h3>
        <p className="text-sm text-slate-500 mb-4">Сэдвийн хувь = тухайн сэдвийн зөв хариулт / боломжит хариулт. Ганц асуулттай сэдвийг "нотолгоо хангалтгүй" гэж тэмдэглэнэ.</p>
        <div className="flex flex-col gap-1">
          {r.topics.filter((t) => t.id !== 'none').map((t) => (
            <div key={t.id}>
              <button className="w-full text-left cursor-pointer" onClick={() => setOpen(open === t.id ? null : t.id)}>
                <HBar
                  label={t.name}
                  sub={`${t.questions} асуулт · ${t.responses} хариулт`}
                  value={t.accuracy}
                  right={<Badge className={LABEL_STYLE[t.label]}>{r.labels[t.label as keyof typeof r.labels]}</Badge>}
                />
              </button>
              {open === t.id && (
                <div className="ml-2 mb-3 p-3 bg-slate-50 rounded-lg text-sm flex flex-col gap-2">
                  {t.singleQuestion && <p className="text-amber-700">⚠ Энэ сэдвийг ганц асуултаар шалгасан тул дүгнэлт хязгаарлагдмал.</p>}
                  <p>Зөв {t.correct} · Буруу {t.incorrect} · Хариулаагүй {t.unanswered} · Дундаж {fmtSec(t.avgResponseMs)}</p>
                  {t.commonMisconceptions.length > 0 && (
                    <div>
                      <b>Түгээмэл буруу ойлголт:</b>
                      <ul className="list-disc ml-5">{t.commonMisconceptions.map((m) => <li key={m.misconception}>{m.misconception} ({m.count} хүн)</li>)}</ul>
                    </div>
                  )}
                  <p>
                    <b>Нэмэлт дасгал хэрэгтэй байж болох сурагчид:</b>{' '}
                    {t.studentsNeedingPractice.length ? t.studentsNeedingPractice.map((s) => `${s.nickname} (${s.correct}/${s.total})`).join(', ') : 'алга'}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Coverage r={r} />
    </div>
  );
}

function Coverage({ r }: { r: Report }) {
  return (
    <Card className="overflow-x-auto">
      <h3 className="font-bold mb-1">Хөтөлбөрийн хамрах хүрээ</h3>
      <p className="text-sm text-slate-500 mb-3">Шалгаагүй сэдвийг "эзэмшсэн" гэж хэзээ ч тооцохгүй.</p>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500"><tr><Th>Курс</Th><Th>Сэдэв</Th><Th>Эх сурвалж</Th><Th>Асуулт</Th><Th>Төлөв</Th></tr></thead>
        <tbody>
          {r.coverage.map((c) => (
            <tr key={c.id} className="border-t border-slate-100">
              <Td>{c.course}</Td><Td>{c.name}</Td>
              <Td className="text-slate-500">{c.source}</Td>
              <Td>{c.questionIds.join(', ') || '—'}</Td>
              <Td>{c.assessed ? <Badge className="bg-emerald-100 text-emerald-800">Шалгасан</Badge> : <Badge className="bg-gray-100 text-gray-600">Шалгаагүй</Badge>}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Questions({ r }: { r: Report }) {
  const [open, setOpen] = useState<number | null>(null);
  const [sort, setSort] = useState<'order' | 'acc'>('order');
  const qs = useMemo(() => [...r.questions].sort((a, b) => (sort === 'acc' ? (a.accuracy ?? 101) - (b.accuracy ?? 101) : a.index - b.index)), [r, sort]);
  return (
    <Card className="p-0 overflow-x-auto">
      <div className="p-4 flex items-center gap-3">
        <h3 className="font-bold flex-1">Асуулт тус бүрийн үзүүлэлт</h3>
        <select className="border border-slate-300 rounded-md text-sm p-1.5" value={sort} onChange={(e) => setSort(e.target.value as 'order' | 'acc')}>
          <option value="order">Дарааллаар</option>
          <option value="acc">Хамгийн хэцүүгээс</option>
        </select>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 bg-slate-50">
          <tr><Th>#</Th><Th>Сэдэв</Th><Th>Түвшин</Th><Th>Зөв %</Th><Th>З/Б/Х</Th><Th>Дундаж</Th><Th>Хамгийн их сонгосон буруу хариулт</Th></tr>
        </thead>
        <tbody>
          {qs.map((q) => (
            <Fragment key={q.index}>
              <tr className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer align-top" onClick={() => setOpen(open === q.index ? null : q.index)}>
                <Td className="font-semibold">{q.id}</Td>
                <Td>{q.topic}<div className="text-xs text-slate-400">{q.course}</div></Td>
                <Td>{q.difficulty ? DIFF[q.difficulty] : '—'}</Td>
                <Td className="w-40"><MiniBar value={q.accuracy} /></Td>
                <Td className="tabular-nums">{q.correct}/{q.incorrect}/{q.unanswered}</Td>
                <Td>{fmtSec(q.avgResponseMs)}</Td>
                <Td>
                  {q.topWrong ? (
                    <>
                      <code className="bg-rose-50 text-rose-700 px-1 rounded">{q.topWrong.answer}</code> · {q.topWrong.count} хүн
                      {q.topWrong.misconception && <div className="text-xs text-slate-500">{q.topWrong.misconception}</div>}
                    </>
                  ) : '—'}
                </Td>
              </tr>
              {open === q.index && (
                <tr className="bg-slate-50">
                  <td colSpan={7} className="p-4">
                    <QuestionDetail q={q} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function QuestionDetail({ q, selected }: { q: Report['questions'][number]; selected?: number | null }) {
  return (
    <div className="flex flex-col gap-2 text-sm max-w-3xl">
      <p className="font-semibold text-base">{q.text}</p>
      {q.code && <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto text-xs">{q.code}</pre>}
      <div className="flex flex-col gap-1">
        {q.answers.map((a, i) => (
          <div key={i} className={`flex items-center gap-2 rounded px-2 py-1 ${i === q.correctIndex ? 'bg-emerald-50' : selected === i ? 'bg-rose-50' : ''}`}>
            <span className="w-5 font-bold">{i === q.correctIndex ? '✓' : selected === i ? '✕' : ''}</span>
            <span className="flex-1 font-mono">{a}</span>
            <span className="tabular-nums text-slate-500">{q.optionCounts[i]} хүн</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-2 py-1 text-slate-500"><span className="w-5">⌛</span><span className="flex-1">Хариулаагүй</span><span>{q.unanswered} хүн</span></div>
      </div>
      {q.explanation && <p className="bg-white border border-slate-200 rounded-lg p-3"><b>Тайлбар:</b> {q.explanation}</p>}
    </div>
  );
}

function Students({ r, onOpen }: { r: Report; onOpen: (id: string) => void }) {
  return (
    <Card className="p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-slate-500 bg-slate-50">
          <tr><Th>Байр</Th><Th>Нэр</Th><Th>Тоглоомын оноо</Th><Th>Зөв</Th><Th>Буруу</Th><Th>Хариулаагүй</Th><Th>Зөв %</Th>{r.courses.map((c) => <Th key={c.id}>{c.name}</Th>)}</tr>
        </thead>
        <tbody>
          {r.students.map((s) => (
            <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => onOpen(s.id)}>
              <Td>{s.rank || '—'}</Td>
              <Td className="font-semibold text-k-purple">{s.nickname}</Td>
              <Td className="tabular-nums">{s.score}</Td>
              <Td>{s.correct}</Td><Td>{s.incorrect}</Td><Td>{s.unanswered}</Td>
              <Td className="w-36"><MiniBar value={s.accuracy} /></Td>
              {r.courses.map((c) => {
                const pc = s.perCourse.find((x) => x.courseId === c.id);
                return <Td key={c.id}>{pc ? `${pc.correct}/${pc.total}` : '—'}</Td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500 p-3">Тоглоомын оноо хурдыг шагнадаг. Зөв % нь зөвхөн зөв эсэхэд тулгуурладаг тул удаан ч зөв хариулсан сурагч доогуур үнэлэгдэхгүй.</p>
    </Card>
  );
}

function StudentDetail({ r, id, onBack }: { r: Report; id: string; onBack: () => void }) {
  const s = r.students.find((x) => x.id === id)!;
  return (
    <div className="flex flex-col gap-4">
      <button className="self-start text-sm text-slate-500 hover:text-slate-900 cursor-pointer" onClick={onBack}>← Бүх сурагч</button>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Нэр" value={s.nickname} />
        <Kpi label="Байр / оноо" value={`${s.rank || '—'} · ${s.score}`} />
        <Kpi label="Зөв %" value={fmtPct(s.accuracy)} accent />
        <Kpi label="З / Б / Х" value={`${s.correct} / ${s.incorrect} / ${s.unanswered}`} />
        <Kpi label="Оролцох боломжтой асуулт" value={s.eligibleQuestions} />
      </div>
      <Card>
        <h3 className="font-bold mb-3">Сэдвээр</h3>
        {s.perTopic.map((t) => (
          <HBar key={t.topicId} label={t.name} sub={`${t.correct}/${t.total}`} value={t.accuracy} right={<Badge className={LABEL_STYLE[t.label]}>{r.labels[t.label as keyof typeof r.labels]}</Badge>} />
        ))}
      </Card>
      <Card>
        <h3 className="font-bold mb-3">Хариултын түүх</h3>
        <div className="flex flex-col gap-3">
          {s.history.map((h) => {
            const q = r.questions[h.questionIndex];
            return (
              <details key={h.questionIndex} className="border border-slate-200 rounded-lg">
                <summary className="flex items-center gap-3 p-2 cursor-pointer">
                  <Cell status={h.status} />
                  <span className="font-semibold">{q.id}</span>
                  <span className="flex-1 truncate text-slate-600">{q.text}</span>
                  <span className="text-slate-500 text-xs">{fmtSec(h.responseTimeMs)}</span>
                </summary>
                <div className="p-3 pt-0"><QuestionDetail q={q} selected={h.selectedOption} /></div>
              </details>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Matrix({ r }: { r: Report }) {
  const [course, setCourse] = useState('all');
  const [topic, setTopic] = useState('all');
  const [sel, setSel] = useState<{ s: string; q: number } | null>(null);
  const cols = r.questions.filter((q) => (course === 'all' || q.courseId === course) && (topic === 'all' || q.topicId === topic));
  const topicsForCourse = r.topics.filter((t) => t.id !== 'none' && (course === 'all' || t.courseId === course));
  const selStudent = sel && r.students.find((x) => x.id === sel.s);
  const selAttempt = selStudent?.history.find((h) => h.questionIndex === sel!.q);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <select className="border border-slate-300 rounded-md p-1.5" value={course} onChange={(e) => { setCourse(e.target.value); setTopic('all'); }}>
          <option value="all">Бүх курс</option>
          {r.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="border border-slate-300 rounded-md p-1.5" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="all">Бүх сэдэв</option>
          {topicsForCourse.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="flex items-center gap-3 ml-auto text-slate-500">
          <span className="flex items-center gap-1"><Cell status="correct" /> Зөв</span>
          <span className="flex items-center gap-1"><Cell status="incorrect" /> Буруу</span>
          <span className="flex items-center gap-1"><Cell status="unanswered" /> Хариулаагүй</span>
          <span className="flex items-center gap-1"><Cell status={null} /> Оролцоогүй</span>
        </span>
      </div>
      <Card className="p-0 overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white p-2 text-left">Сурагч</th>
              {cols.map((q) => <th key={q.index} className="p-1 font-semibold text-slate-500" title={q.text}>{q.id.replace('Q', '')}</th>)}
              <th className="p-2 text-slate-500">Зөв</th>
            </tr>
          </thead>
          <tbody>
            {r.students.map((s) => {
              const correct = cols.filter((q) => s.history.find((h) => h.questionIndex === q.index)?.status === 'correct').length;
              const elig = cols.filter((q) => s.history.some((h) => h.questionIndex === q.index)).length;
              return (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="sticky left-0 bg-white p-2 font-semibold whitespace-nowrap">{s.nickname}</td>
                  {cols.map((q) => {
                    const h = s.history.find((x) => x.questionIndex === q.index);
                    return (
                      <td key={q.index} className="p-0.5">
                        <button className={`cursor-pointer ${sel?.s === s.id && sel.q === q.index ? 'ring-2 ring-k-purple rounded' : ''}`} onClick={() => setSel({ s: s.id, q: q.index })}>
                          <Cell status={h?.status ?? null} />
                        </button>
                      </td>
                    );
                  })}
                  <td className="p-2 tabular-nums text-slate-600">{correct}/{elig}</td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-slate-200">
              <td className="sticky left-0 bg-white p-2 text-slate-500">Зөв %</td>
              {cols.map((q) => <td key={q.index} className="p-1 text-center text-slate-500">{q.accuracy !== null ? Math.round(q.accuracy) : '—'}</td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </Card>
      {sel && selStudent && (
        <Card>
          <div className="flex items-center gap-2 mb-2">
            <b>{selStudent.nickname}</b> · {r.questions[sel.q].id} ·
            <span>{selAttempt ? { correct: 'Зөв', incorrect: 'Буруу', unanswered: 'Хариулаагүй' }[selAttempt.status] : 'Энэ асуултад оролцоогүй (дараа нь нэгдсэн / холболтгүй байсан)'}</span>
            {selAttempt?.responseTimeMs != null && <span className="text-slate-500">· {fmtSec(selAttempt.responseTimeMs)}</span>}
            <button className="ml-auto text-slate-400 cursor-pointer" onClick={() => setSel(null)}>✕</button>
          </div>
          <QuestionDetail q={r.questions[sel.q]} selected={selAttempt?.selectedOption ?? null} />
        </Card>
      )}
    </div>
  );
}

function Recs({ r, limit }: { r: Report; limit?: number }) {
  const list = limit ? r.recommendations.slice(0, limit) : r.recommendations;
  return (
    <Card>
      <h3 className="font-bold mb-2">Сургалтын зөвлөмж (өгөгдөлд тулгуурласан дохио)</h3>
      {list.length === 0 ? (
        <p className="text-sm text-slate-500">Онцгой анхаарах дохио алга.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {list.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span>{x.level === 'high' ? '🔴' : x.level === 'medium' ? '🟡' : 'ℹ️'}</span>
              <span>{x.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FullReport({ r }: { r: Report }) {
  const o = r.overview;
  const hardest = [...r.questions].filter((q) => q.accuracy !== null).sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)).slice(0, 5);
  const misc = r.questions.filter((q) => q.topWrong?.misconception && (q.topWrong.share ?? 0) >= 20);
  const reinforce = r.topics.filter((t) => t.id !== 'none' && (t.label === 'review' || t.label === 'practice'));
  return (
    <article className="bg-white border border-slate-200 rounded-xl p-6 md:p-10 max-w-4xl flex flex-col gap-6 text-[15px] leading-relaxed print:border-0 print:p-0">
      <header>
        <h2 className="text-2xl font-bold">Сургалтын тайлан{r.session.demo && ' (ДЕМО өгөгдөл)'}</h2>
        <p className="text-slate-500">{r.session.title} · {fmtDate(r.session.startedAt)}</p>
      </header>
      <Section n={1} t="Сессийн тойм">
        {o.questionsAsked}/{o.questions} асуулт асуугдсан. Нийт {o.eligibleAttempts} боломжит хариултаас {o.submittedAnswers} нь илгээгдсэн (оролцоо {fmtPct(o.participation)}).
      </Section>
      <Section n={2} t="Оролцогчид">{o.participants} оролцогч; эцсийн асуулт хүртэл {fmtPct(o.completionRate)} нь үлдсэн.</Section>
      <Section n={3} t="Ерөнхий гүйцэтгэл">
        Зөв хариултын хувь <b>{fmtPct(o.accuracy)}</b> (зөв {o.correct}, буруу {o.incorrect}, хариулаагүй {o.unanswered}). Дундаж хариултын хугацаа {fmtSec(o.avgResponseMs)}.
      </Section>
      <Section n={4} t="Курсээр">
        <ul className="list-disc ml-5">{r.courses.map((c) => <li key={c.id}>{c.name}: {fmtPct(c.accuracy)} ({c.correct}/{c.eligible}, {c.questions} асуулт)</li>)}</ul>
      </Section>
      <Section n={5} t="Сэдвээр">
        <ul className="list-disc ml-5">
          {r.topics.filter((t) => t.id !== 'none').map((t) => (
            <li key={t.id}>{t.name}: {fmtPct(t.accuracy)} · {t.questions} асуулт, {t.responses} хариулт · {r.labels[t.label as keyof typeof r.labels]}{t.singleQuestion && ' (ганц асуулт)'}</li>
          ))}
        </ul>
      </Section>
      <Section n={6} t="Хамгийн хүндрэлтэй асуултууд">
        <ol className="list-decimal ml-5">{hardest.map((q) => <li key={q.index}>{q.id} ({q.topic}): {fmtPct(q.accuracy)}. {q.text}</li>)}</ol>
      </Section>
      <Section n={7} t="Түгээмэл буруу ойлголт">
        {misc.length ? <ul className="list-disc ml-5">{misc.map((q) => <li key={q.index}>{q.id}: "{q.topWrong!.answer}" ({q.topWrong!.count} хүн). {q.topWrong!.misconception}</li>)}</ul> : 'Олон хүн давтагдсан нэг буруу сонголт ажиглагдаагүй.'}
      </Section>
      <Section n={8} t="Сурагч тус бүрийн дүн">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500"><tr><Th>Байр</Th><Th>Нэр</Th><Th>Оноо</Th><Th>Зөв %</Th><Th>З/Б/Х</Th></tr></thead>
          <tbody>{r.students.map((s) => <tr key={s.id} className="border-t border-slate-100"><Td>{s.rank}</Td><Td>{s.nickname}</Td><Td>{s.score}</Td><Td>{fmtPct(s.accuracy)}</Td><Td>{s.correct}/{s.incorrect}/{s.unanswered}</Td></tr>)}</tbody>
        </table>
      </Section>
      <Section n={9} t="Бататгах шаардлагатай сэдвүүд">
        {reinforce.length ? <ul className="list-disc ml-5">{reinforce.map((t) => <li key={t.id}>{t.name} ({fmtPct(t.accuracy)})</li>)}</ul> : 'Шалгасан сэдвүүдэд 80%-иас доош үзүүлэлттэй сэдэв алга.'}
        <p className="text-slate-500 mt-2">Шалгаагүй сэдвүүд: {r.coverage.filter((c) => !c.assessed).map((c) => c.name).join(', ') || 'алга'}.</p>
      </Section>
      <Section n={10} t="Дараагийн сургалтын үйл ажиллагаа">
        <ul className="list-disc ml-5">
          {r.recommendations.slice(0, 8).map((x, i) => <li key={i}>{x.text}</li>)}
          {reinforce.slice(0, 3).map((t) => <li key={t.id}>"{t.name}" сэдвээр 3–5 богино код унших дасгал хийлгэж, дараагийн хичээлийн эхэнд давтах.</li>)}
        </ul>
      </Section>
      <p className="text-xs text-slate-500 border-t pt-3">
        Тайлбар: 20 асуулттай нэг тест нь хязгаарлагдмал нотолгоо. Дүгнэлтүүд нь "сургалтын дохио" бөгөөд сурагчийн чадварын эцсийн үнэлгээ биш.
      </p>
    </article>
  );
}

// ---------------- primitives ----------------
function Section({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-lg mb-1">{n}. {t}</h3>
      <div>{children}</div>
    </section>
  );
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm ${className}`}>{children}</div>;
}
function Kpi({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-k-purple' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </Card>
  );
}
function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 whitespace-nowrap ${className}`}>{children}</span>;
}
const Th = ({ children }: { children?: React.ReactNode }) => <th className="px-3 py-2 font-semibold whitespace-nowrap">{children}</th>;
const Td = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => <td className={`px-3 py-2 ${className}`}>{children}</td>;
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border border-dashed border-slate-300 rounded-xl p-10 text-center text-slate-500">{children}</div>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-3">{children}</p>;
}
function MiniBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${accColor(value)}`} style={{ width: `${value ?? 0}%` }} /></div>
      <span className="tabular-nums w-12 text-right">{fmtPct(value)}</span>
    </div>
  );
}
function HBar({ label, sub, value, right }: { label: string; sub?: string; value: number | null; right?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(140px,220px)_1fr_190px] items-center gap-3 py-1.5">
      <div className="text-sm"><div className="font-semibold leading-tight">{label}</div>{sub && <div className="text-xs text-slate-400">{sub}</div>}</div>
      <div className="h-5 bg-slate-100 rounded overflow-hidden relative">
        <div className={`h-full ${accColor(value)}`} style={{ width: `${value ?? 0}%` }} />
        <span className="absolute inset-y-0 left-2 flex items-center text-xs font-bold text-slate-800">{fmtPct(value)}</span>
      </div>
      <div className="text-sm text-slate-500">{right}</div>
    </div>
  );
}
function Stacked({ correct, incorrect, unanswered }: { correct: number; incorrect: number; unanswered: number }) {
  const t = Math.max(1, correct + incorrect + unanswered);
  return (
    <div className="flex h-4 rounded overflow-hidden">
      <div className="bg-emerald-500" style={{ width: `${(correct / t) * 100}%` }} title={`Зөв ${correct}`} />
      <div className="bg-rose-500" style={{ width: `${(incorrect / t) * 100}%` }} title={`Буруу ${incorrect}`} />
      <div className="bg-slate-300" style={{ width: `${(unanswered / t) * 100}%` }} title={`Хариулаагүй ${unanswered}`} />
    </div>
  );
}
function Cell({ status }: { status: string | null }) {
  const c = status === 'correct' ? 'bg-emerald-500' : status === 'incorrect' ? 'bg-rose-500' : status === 'unanswered' ? 'bg-slate-300' : 'bg-white border border-dashed border-slate-300';
  const sym = status === 'correct' ? '✓' : status === 'incorrect' ? '✕' : status === 'unanswered' ? '–' : '';
  return <span className={`inline-flex w-6 h-6 rounded items-center justify-center text-white font-bold ${c}`}>{sym}</span>;
}
