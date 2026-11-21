import { QRCodeSVG } from 'qrcode.react';
import { useStore } from '../store';
import { socket } from '../socket';
import { Button, COLORS, Countdown, Logo, Shape } from '../components/ui';
import type { HostState } from '../../../shared/types';

export default function HostGame() {
  const s = useStore((x) => x.host);
  if (!s) return <div className="min-h-dvh flex items-center justify-center text-2xl">Холбогдож байна…</div>;
  if (s.phase === 'lobby') return <Lobby s={s} />;
  if (s.phase === 'question') return <QuestionView s={s} />;
  if (s.phase === 'reveal') return <Reveal s={s} />;
  if (s.phase === 'leaderboard') return <Leaderboard s={s} />;
  return <Podium s={s} />;
}

const next = () => socket.emit('host:next');

function Lobby({ s }: { s: HostState }) {
  const joinUrl = `${location.origin}/?pin=${s.pin}`;
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="bg-white text-gray-900 p-4 flex flex-wrap items-center justify-center gap-8 shadow-xl">
        <div className="text-center">
          <p className="font-bold text-gray-500">Нэгдэх хаяг: <b className="text-gray-900">{location.host}</b></p>
          <p className="font-bold text-gray-500 mt-2">Game PIN:</p>
          <p className="text-7xl font-black tracking-widest">{s.pin}</p>
        </div>
        <div className="bg-white p-2 rounded">
          <QRCodeSVG value={joinUrl} size={140} />
        </div>
      </header>
      <div className="flex items-center justify-between p-6">
        <div className="bg-black/30 rounded-lg px-4 py-2 font-bold text-xl">👤 {s.players.length}</div>
        <Logo className="text-4xl" />
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
    </div>
  );
}

function QuestionView({ s }: { s: HostState }) {
  const q = s.question!;
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="bg-white text-gray-900 text-center p-6 text-3xl md:text-4xl font-black shadow-xl">{q.text}</div>
      <div className="flex-1 flex items-center justify-between px-8">
        <Countdown endsAt={q.endsAt} />
        <span className="font-bold text-white/70">
          {s.index + 1} / {s.total}
        </span>
        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl font-black">{s.answeredCount}</div>
          <div className="font-bold">Хариулсан</div>
          <Button variant="ghost" onClick={next}>Алгасах</Button>
        </div>
      </div>
      <AnswerGrid answers={q.answers} />
    </div>
  );
}

function AnswerGrid({ answers, correct, counts }: { answers: string[]; correct?: number; counts?: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 p-3">
      {answers.map((a, i) => (
        <div
          key={i}
          className={`${COLORS[i]} rounded-lg p-5 flex items-center gap-4 text-xl md:text-2xl font-bold shadow-lg transition ${
            correct !== undefined && correct !== i ? 'opacity-30' : ''
          }`}
        >
          <Shape i={i} className="w-10 h-10 shrink-0" />
          <span className="flex-1">{a}</span>
          {correct === i && <span className="text-3xl">✓</span>}
          {counts && <span className="text-2xl font-black">{counts[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function Reveal({ s }: { s: HostState }) {
  const q = s.question!;
  const counts = s.counts ?? [0, 0, 0, 0];
  const max = Math.max(1, ...counts);
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="bg-white text-gray-900 text-center p-6 text-3xl font-black shadow-xl">{q.text}</div>
      <div className="flex-1 flex items-end justify-center gap-6 p-8">
        {counts.map((c, i) => (
          <div key={i} className="flex flex-col items-center gap-2 w-24">
            <span className="text-2xl font-black">{c}</span>
            <div
              className={`${COLORS[i]} w-full rounded-t-md transition-all duration-700 ${q.correct === i ? '' : 'opacity-40'}`}
              style={{ height: `${(c / max) * 220 + 12}px` }}
            />
            <div className={`${COLORS[i]} w-full rounded-b-md flex justify-center p-2`}>
              <Shape i={i} className="w-6 h-6" />
              {q.correct === i && <span className="ml-1 font-black">✓</span>}
            </div>
          </div>
        ))}
        <Button className="self-start ml-8" onClick={next}>Дараах ▶</Button>
      </div>
      <AnswerGrid answers={q.answers} correct={q.correct} />
    </div>
  );
}

function Leaderboard({ s }: { s: HostState }) {
  const top = (s.leaderboard ?? []).slice(0, 5);
  return (
    <div className="min-h-dvh flex flex-col items-center gap-6 p-8">
      <div className="w-full flex justify-end">
        <Button onClick={next}>Дараах асуулт ▶</Button>
      </div>
      <h2 className="bg-white text-gray-900 text-4xl font-black rounded-lg px-10 py-4">Тэргүүлэгчид</h2>
      <div className="w-full max-w-2xl flex flex-col gap-3">
        {top.map((p, i) => (
          <div
            key={p.id}
            className="pop flex justify-between bg-white text-gray-900 rounded-lg px-6 py-4 text-2xl font-black"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <span>{i + 1}. {p.name}</span>
            <span>{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Podium({ s }: { s: HostState }) {
  const reset = useStore((x) => x.reset);
  const lb = s.leaderboard ?? [];
  const order = [1, 0, 2]; // 2nd, 1st, 3rd
  const heights = ['h-64', 'h-48', 'h-36'];
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="min-h-dvh flex flex-col items-center p-8 gap-6">
      <h2 className="text-5xl font-black pop">{s.title}</h2>
      <div className="flex-1 flex items-end gap-4">
        {order.map((rank) =>
          lb[rank] ? (
            <div key={rank} className="flex flex-col items-center gap-2 w-40 pop" style={{ animationDelay: `${(2 - rank) * 0.6}s` }}>
              <span className="text-5xl">{medals[rank]}</span>
              <span className="text-2xl font-black text-center break-all">{lb[rank].name}</span>
              <span className="font-bold">{lb[rank].score}</span>
              <div className={`${heights[rank]} w-full bg-white/20 rounded-t-lg flex items-start justify-center pt-3 text-5xl font-black`}>
                {rank + 1}
              </div>
            </div>
          ) : null,
        )}
      </div>
      <Button onClick={reset}>Шинэ тоглоом</Button>
    </div>
  );
}
