import { useStore } from '../store';
import { socket } from '../socket';
import { Button, COLORS, Shape } from '../components/ui';
import type { PlayerState } from '../../../shared/types';

export default function PlayerGame() {
  const s = useStore((x) => x.player);
  const kicked = useStore((x) => x.kicked);
  const reset = useStore((x) => x.reset);

  if (kicked)
    return (
      <div className="min-h-dvh flex"><Center>
        <p className="text-2xl font-bold">Тоглоом дууссан эсвэл та хасагдлаа.</p>
        <Button onClick={reset}>Нүүр хуудас</Button>
      </Center></div>
    );
  if (!s) return <div className="min-h-dvh flex"><Center><p className="text-xl">Холбогдож байна…</p></Center></div>;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex justify-between items-center p-3 bg-black/20 font-bold">
        <span>PIN {s.pin}</span>
        {s.index >= 0 && <span>{s.index + 1} / {s.total}</span>}
      </header>
      <main className="flex-1 flex flex-col">
        <Body s={s} />
      </main>
      <footer className="flex justify-between items-center p-3 bg-white text-gray-900 font-black text-lg">
        <span>{s.name}</span>
        <span className="bg-gray-900 text-white rounded px-3 py-1">{s.score}</span>
      </footer>
    </div>
  );
}

function Body({ s }: { s: PlayerState }) {
  if (s.phase === 'lobby')
    return (
      <Center>
        <p className="text-3xl font-black">Та орлоо! 🎉</p>
        <p className="text-lg">Нэрээ дэлгэц дээрээс хараарай</p>
        <p className="text-white/70">Хөтлөгч эхлүүлэхийг хүлээж байна…</p>
      </Center>
    );

  if (s.phase === 'question') {
    if (s.answered)
      return (
        <Center>
          <div className="w-14 h-14 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-2xl font-black">Хурдан байсан уу?</p>
        </Center>
      );
    return (
      <div className="flex-1 flex flex-col gap-3 p-3">
        {s.question && <p className="text-center text-xl font-bold py-2">{s.question.text}</p>}
        <div className="flex-1 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <button
              key={i}
              onClick={() => socket.emit('player:answer', i)}
              className={`${COLORS[i]} rounded-xl flex flex-col items-center justify-center gap-2 p-3 shadow-[0_6px_0_rgba(0,0,0,0.3)] active:translate-y-1 active:shadow-none transition cursor-pointer`}
            >
              <Shape i={i} className="w-14 h-14" />
              <span className="font-bold text-sm sm:text-base">{s.question?.answers[i]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (s.phase === 'reveal' || s.phase === 'leaderboard') {
    const r = s.lastResult;
    const ok = r?.correct;
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-4 p-6 ${ok ? 'bg-k-green' : 'bg-k-red'}`}>
        <p className="text-4xl font-black pop">{ok ? 'Зөв! ✓' : 'Буруу ✕'}</p>
        {ok ? (
          <p className="bg-black/25 rounded-lg px-6 py-2 text-2xl font-black">+{r?.points}</p>
        ) : (
          <p className="text-center">Зөв хариулт: <b>{r?.correctAnswer}</b></p>
        )}
        <p className="text-xl font-bold">Та {s.rank}-р байранд байна</p>
      </div>
    );
  }

  // ended
  const medal = ['🥇', '🥈', '🥉'][s.rank - 1];
  return (
    <Center>
      <p className="text-6xl">{medal ?? '🎉'}</p>
      <p className="text-3xl font-black">{s.rank}-р байр</p>
      <p className="text-lg">{s.playerCount} тоглогчоос · {s.score} оноо</p>
      <Button onClick={() => useStore.getState().reset()}>Дахин тоглох</Button>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>;
}
