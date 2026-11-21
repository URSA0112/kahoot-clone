import { useStore } from '../store';
import { socket } from '../socket';
import { Button, CodeBlock, COLORS, Shape, useRemaining } from '../components/ui';
import type { PlayerState } from '../../../shared/types';

export default function PlayerGame() {
  const s = useStore((x) => x.player);
  const kicked = useStore((x) => x.kicked);
  const reset = useStore((x) => x.reset);

  if (kicked)
    return (
      <div className="min-h-dvh flex">
        <Center>
          <p className="text-2xl font-bold">Тоглоом дууссан эсвэл та хасагдлаа.</p>
          <Button onClick={reset}>Нүүр хуудас</Button>
        </Center>
      </div>
    );
  if (!s)
    return (
      <div className="min-h-dvh flex">
        <Center>
          <p className="text-xl">Холбогдож байна…</p>
        </Center>
      </div>
    );

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex justify-between items-center p-3 bg-black/20 font-bold">
        <span>PIN {s.pin}</span>
        {s.paused && <span className="text-yellow-300">⏸ Түр зогссон</span>}
        {s.index >= 0 && (
          <span>
            {Math.min(s.index + (s.phase === 'COUNTDOWN' ? 2 : 1), s.total)} / {s.total}
          </span>
        )}
      </header>
      <main className="flex-1 flex flex-col">
        <Body s={s} />
      </main>
      <footer className="flex justify-between items-center p-3 bg-white text-gray-900 font-black text-lg">
        <span>{s.name}</span>
        <span className="bg-gray-900 text-white rounded px-3 py-1 tabular-nums">{s.score}</span>
      </footer>
    </div>
  );
}

function Body({ s }: { s: PlayerState }) {
  const left = useRemaining(s.phaseEndsAt);

  if (s.phase === 'LOBBY')
    return (
      <Center>
        <p className="text-3xl font-black">Та орлоо! 🎉</p>
        <p className="text-lg">Нэрээ дэлгэц дээрээс хараарай</p>
        <p className="text-white/70">Хөтлөгч эхлүүлэхийг хүлээж байна…</p>
      </Center>
    );

  if (s.phase === 'COUNTDOWN')
    return (
      <Center>
        <p className="text-xl font-bold">Бэлэн үү?</p>
        <div key={Math.ceil(left / 1000)} className="pop w-32 h-32 rounded-full bg-white text-k-purple flex items-center justify-center text-6xl font-black">
          {s.paused ? '⏸' : Math.max(1, Math.ceil(left / 1000))}
        </div>
      </Center>
    );

  if (s.phase === 'QUESTION_ACTIVE') {
    if (!s.eligible)
      return (
        <Center>
          <p className="text-2xl font-black">Энэ асуулт эхэлсний дараа нэгдсэн тул</p>
          <p className="text-lg">дараагийн асуултаас эхлэн тоглоно ⏳</p>
        </Center>
      );
    if (s.answered)
      return (
        <Center>
          <div className="w-14 h-14 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-2xl font-black">Хариулт илгээгдлээ!</p>
          <p className="text-white/70">Бусдыг хүлээж байна…</p>
        </Center>
      );
    return (
      <div className="flex-1 flex flex-col gap-3 p-3">
        <div className="flex items-start justify-between gap-3">
          {s.question && <p className="text-lg font-bold">{s.question.text}</p>}
          <span className="shrink-0 w-10 h-10 rounded-full bg-white text-k-purple font-black flex items-center justify-center tabular-nums">
            {Math.ceil(left / 1000)}
          </span>
        </div>
        {s.question?.code && <CodeBlock code={s.question.code} className="text-xs" />}
        <div className="flex-1 grid grid-cols-2 gap-3 min-h-64">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => socket.emit('player:answer', i)}
              className={`${COLORS[i]} rounded-xl flex flex-col items-center justify-center gap-2 p-3 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-none transition cursor-pointer`}
            >
              <Shape i={i} className="w-10 h-10" />
              <span className={`font-bold text-sm sm:text-base break-words ${s.question?.code ? 'font-mono' : ''}`}>{s.question?.answers[i]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (s.phase === 'QUESTION_RESULTS' || s.phase === 'LEADERBOARD') {
    const r = s.lastResult;
    const bg = r?.status === 'correct' ? 'bg-k-green' : r?.status === 'incorrect' ? 'bg-k-red' : 'bg-white/10';
    const title =
      r?.status === 'correct' ? 'Зөв! ✓' : r?.status === 'incorrect' ? 'Буруу ✕' : r?.status === 'unanswered' ? 'Хугацаа дууслаа ⌛' : 'Дараагийн асуултаас';
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center ${bg}`}>
        <p className="text-4xl font-black pop">{title}</p>
        {r?.status === 'correct' && <p className="bg-black/25 rounded-lg px-6 py-2 text-2xl font-black">+{r.points}</p>}
        {r && r.status !== 'correct' && r.status !== 'not_eligible' && (
          <p>
            Зөв хариулт: <b>{r.correctAnswer}</b>
          </p>
        )}
        {r?.explanation && <p className="bg-black/25 rounded-lg p-3 text-sm max-w-md leading-relaxed">{r.explanation}</p>}
        {r?.keyConcept && <p className="text-sm">🔑 {r.keyConcept}</p>}
        <p className="text-xl font-bold">
          Байр: {s.rank} / {s.playerCount}
        </p>
      </div>
    );
  }

  const medal = ['🥇', '🥈', '🥉'][s.rank - 1];
  return (
    <Center>
      <p className="text-6xl">{medal ?? '🎉'}</p>
      <p className="text-3xl font-black">{s.rank}-р байр</p>
      <p className="text-lg">
        {s.playerCount} тоглогчоос · {s.score} оноо
      </p>
      <Button onClick={() => useStore.getState().reset()}>Дахин тоглох</Button>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}
