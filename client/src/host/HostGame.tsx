import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import { socket } from '../socket';
import { AutoBar, Button, CodeBlock, COLORS, Countdown, Logo, Shape, useRemaining } from '../components/ui';
import type { HostState } from '../../../shared/types';

export default function HostGame() {
  const s = useStore((x) => x.host);
  if (!s) return <div className="min-h-dvh flex items-center justify-center text-2xl">Холбогдож байна…</div>;
  return (
    <div className="min-h-dvh flex flex-col">
      {s.phase === 'LOBBY' && <Lobby s={s} />}
      {s.phase === 'COUNTDOWN' && <CountdownView s={s} />}
      {s.phase === 'QUESTION_ACTIVE' && <QuestionView s={s} />}
      {s.phase === 'QUESTION_RESULTS' && <Results s={s} />}
      {s.phase === 'LEADERBOARD' && <Leaderboard s={s} />}
      {s.phase === 'GAME_FINISHED' && <Podium s={s} />}
      {s.phase !== 'LOBBY' && s.phase !== 'GAME_FINISHED' && <HostControls s={s} />}
    </div>
  );
}

function HostControls({ s }: { s: HostState }) {
  const canPause = s.phase !== 'QUESTION_ACTIVE';
  return (
    <div className="fixed bottom-3 right-3 flex gap-2 z-10">
      {s.paused ? (
        <Button onClick={() => socket.emit('host:resume')}>▶ Үргэлжлүүлэх</Button>
      ) : (
        <Button variant="ghost" disabled={!canPause} title={canPause ? '' : 'Асуулт дууссаны дараа зогсооно'} onClick={() => socket.emit('host:pause')}>
          ⏸ Зогсоох
        </Button>
      )}
      <Button variant="ghost" disabled={!canPause} onClick={() => socket.emit('host:skip')}>
        ⏭ Алгасах
      </Button>
    </div>
  );
}

function Lobby({ s }: { s: HostState }) {
  const joinUrl = `${location.origin}/?pin=${s.pin}`;
  return (
    <>
      <header className="bg-white text-gray-900 p-4 flex flex-wrap items-center justify-center gap-8 shadow-xl">
        <div className="text-center">
          <p className="font-bold text-gray-500">
            Нэгдэх хаяг: <b className="text-gray-900">{location.host}</b>
          </p>
          <p className="font-bold text-gray-500 mt-2">Game PIN:</p>
          <p className="text-7xl font-black tracking-widest">{s.pin}</p>
        </div>
        <div className="bg-white p-2 rounded">
          <QRCodeSVG value={joinUrl} size={140} />
        </div>
      </header>
      <div className="flex items-center justify-between p-6">
        <div className="bg-black/30 rounded-lg px-4 py-2 font-bold text-xl">👤 {s.players.length}</div>
        <div className="text-center">
          <Logo className="text-4xl" />
          <p className="text-white/70 text-sm mt-1">{s.title} · {s.total} асуулт</p>
        </div>
        <Button onClick={() => socket.emit('host:start')} disabled={s.players.length === 0}>
          Эхлэх ▶
        </Button>
      </div>
      <div className="flex-1 flex flex-wrap content-start justify-center gap-3 p-6">
        {s.players.length === 0 && <p className="text-2xl font-bold text-white/70 mt-10">Тоглогчдыг хүлээж байна…</p>}
        {s.players.map((p) => (
          <button
            key={p.id}
            className="pop bg-black/30 hover:line-through rounded-lg px-5 py-2 text-xl font-bold cursor-pointer"
            title="Хасах"
            onClick={() => socket.emit('host:kick', p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <p className="text-center text-white/60 text-sm pb-4">
        Тоглоом эхэлсний дараа асуултууд автоматаар ээлжлэн гарна. Хэрэгтэй үед ⏸ товчоор зогсоож ярилцаж болно.
      </p>
    </>
  );
}

function CountdownView({ s }: { s: HostState }) {
  const left = useRemaining(s.phaseEndsAt, s.paused ? s.pausedRemainingMs : null);
  const n = Math.max(1, Math.ceil(left / 1000));
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <p className="text-2xl font-bold text-white/80">
        Асуулт {s.index + 2} / {s.total}
      </p>
      <div key={n} className="pop w-48 h-48 rounded-full bg-white text-k-purple flex items-center justify-center text-8xl font-black">
        {s.paused ? '⏸' : n}
      </div>
      {s.paused && <p className="text-xl font-bold text-yellow-300">Түр зогссон{s.players.every((p) => !p.connected) ? ': холбогдсон тоглогч алга' : ''}</p>}
    </div>
  );
}

function QuestionHeader({ s }: { s: HostState }) {
  const q = s.question!;
  return (
    <div className="bg-white text-gray-900 p-5 shadow-xl">
      <div className="text-center text-2xl md:text-3xl font-black">{q.text}</div>
      {q.code && <CodeBlock code={q.code} className="mt-4 max-w-3xl mx-auto text-base md:text-lg" />}
    </div>
  );
}

function QuestionView({ s }: { s: HostState }) {
  const q = s.question!;
  return (
    <>
      <QuestionHeader s={s} />
      <div className="flex-1 flex items-center justify-between px-8 py-4">
        <Countdown endsAt={s.phaseEndsAt} />
        <span className="font-bold text-white/70">
          {s.index + 1} / {s.total}
        </span>
        <div className="flex flex-col items-center">
          <div className="text-4xl font-black tabular-nums">
            {s.answeredCount}/{s.eligibleCount}
          </div>
          <div className="font-bold">Хариулсан</div>
        </div>
      </div>
      <AnswerGrid answers={q.answers} mono={!!q.code} />
    </>
  );
}

function AnswerGrid({ answers, correct, counts, mono }: { answers: string[]; correct?: number; counts?: number[]; mono?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3 pb-20">
      {answers.map((a, i) => (
        <div
          key={i}
          className={`${COLORS[i]} rounded-lg p-4 flex items-center gap-4 text-lg md:text-2xl font-bold shadow-lg transition ${
            correct !== undefined && correct !== i ? 'opacity-30' : ''
          }`}
        >
          <Shape i={i} className="w-9 h-9 shrink-0" />
          <span className={`flex-1 break-words ${mono ? 'font-mono text-base md:text-xl' : ''}`}>{a}</span>
          {correct === i && <span className="text-3xl">✓</span>}
          {counts && <span className="text-2xl font-black">{counts[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function Results({ s }: { s: HostState }) {
  const q = s.question!;
  const r = s.reveal!;
  const max = Math.max(1, ...r.counts, r.unanswered);
  const pctCorrect = r.eligible ? Math.round((r.counts[r.correct] / r.eligible) * 100) : 0;
  return (
    <>
      <AutoBar endsAt={s.phaseEndsAt} totalMs={s.timing.resultsMs} paused={s.paused} frozenMs={s.pausedRemainingMs} />
      <div className="bg-white text-gray-900 p-4 text-center text-xl md:text-2xl font-black shadow-xl">{q.text}</div>
      <div className="flex-1 grid md:grid-cols-[auto_1fr] gap-6 p-6 items-start">
        <div className="flex items-end justify-center gap-4 h-64">
          {r.counts.map((c, i) => (
            <div key={i} className="flex flex-col items-center gap-1 w-16">
              <span className="text-xl font-black">{c}</span>
              <div
                className={`${COLORS[i]} w-full rounded-t-md transition-all duration-700 ${r.correct === i ? '' : 'opacity-40'}`}
                style={{ height: `${(c / max) * 180 + 8}px` }}
              />
              <div className={`${COLORS[i]} w-full rounded-b-md flex justify-center p-1.5`}>
                <Shape i={i} className="w-5 h-5" />
                {r.correct === i && <span className="ml-1 font-black">✓</span>}
              </div>
            </div>
          ))}
          <div className="flex flex-col items-center gap-1 w-16">
            <span className="text-xl font-black">{r.unanswered}</span>
            <div className="bg-white/30 w-full rounded-t-md" style={{ height: `${(r.unanswered / max) * 180 + 8}px` }} />
            <div className="bg-white/30 w-full rounded-b-md text-center text-xs p-1.5 font-bold">⌛</div>
          </div>
        </div>
        <div className="bg-black/30 rounded-xl p-5 flex flex-col gap-3 max-w-2xl">
          <p className="text-lg">
            Зөв хариулт: <b className="text-green-300">{q.answers[r.correct]}</b>{' '}
            <span className="text-white/70">· {pctCorrect}% зөв ({r.counts[r.correct]}/{r.eligible})</span>
          </p>
          {r.explanation && <p className="text-lg leading-relaxed">{r.explanation}</p>}
          {r.keyConcept && (
            <p className="bg-white/10 rounded-lg px-3 py-2">
              🔑 <b>Гол ойлголт:</b> {r.keyConcept}
            </p>
          )}
          {r.commonMistake && (
            <p className="bg-white/10 rounded-lg px-3 py-2">
              ⚠️ <b>Түгээмэл алдаа:</b> {r.commonMistake}
            </p>
          )}
          {s.paused && <p className="text-yellow-300 font-bold">⏸ Ярилцахаар түр зогссон. "Үргэлжлүүлэх" дарахад цааш явна.</p>}
        </div>
      </div>
      <AnswerGrid answers={q.answers} correct={r.correct} mono={!!q.code} />
    </>
  );
}

function Leaderboard({ s }: { s: HostState }) {
  const top = (s.leaderboard ?? []).slice(0, 5);
  const left = useRemaining(s.phaseEndsAt, s.paused ? s.pausedRemainingMs : null);
  const last = s.index >= s.total - 1;
  return (
    <>
      <AutoBar endsAt={s.phaseEndsAt} totalMs={s.timing.leaderboardMs} paused={s.paused} frozenMs={s.pausedRemainingMs} />
      <div className="flex-1 flex flex-col items-center gap-6 p-8">
        <h2 className="bg-white text-gray-900 text-4xl font-black rounded-lg px-10 py-4">Тэргүүлэгчид</h2>
        <div className="w-full max-w-2xl flex flex-col gap-3">
          {top.map((p, i) => (
            <div
              key={p.id}
              className="pop flex justify-between bg-white text-gray-900 rounded-lg px-6 py-4 text-2xl font-black"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <span>
                {i + 1}. {p.name} {!p.connected && <span className="text-sm text-gray-400">(гарсан)</span>}
              </span>
              <span className="tabular-nums">{p.score}</span>
            </div>
          ))}
        </div>
        <p className="text-white/80 font-bold">
          {s.paused ? '⏸ Түр зогссон' : last ? `Эцсийн дүн ${Math.ceil(left / 1000)}…` : `Дараагийн асуулт ${Math.ceil(left / 1000)} секундын дараа`}
        </p>
      </div>
    </>
  );
}

function Podium({ s }: { s: HostState }) {
  const reset = useStore((x) => x.reset);
  const setView = useStore((x) => x.setView);
  const lb = s.leaderboard ?? [];
  const order = [1, 0, 2];
  const heights = ['h-64', 'h-48', 'h-36'];
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="flex-1 flex flex-col items-center p-8 gap-6">
      <h2 className="text-4xl font-black pop text-center">{s.title}</h2>
      <div className="flex-1 flex items-end gap-4">
        {order.map((rank) =>
          lb[rank] ? (
            <div key={rank} className="flex flex-col items-center gap-2 w-40 pop" style={{ animationDelay: `${(2 - rank) * 0.6}s` }}>
              <span className="text-5xl">{medals[rank]}</span>
              <span className="text-2xl font-black text-center break-all">{lb[rank].name}</span>
              <span className="font-bold">{lb[rank].score}</span>
              <div className={`${heights[rank]} w-full bg-white/20 rounded-t-lg flex items-start justify-center pt-3 text-5xl font-black`}>{rank + 1}</div>
            </div>
          ) : null,
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => setView('admin')}>
          📊 Сургалтын тайлан
        </Button>
        <Button onClick={reset}>Шинэ тоглоом</Button>
      </div>
    </div>
  );
}
