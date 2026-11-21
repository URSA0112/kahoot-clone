import { useState } from 'react';
import { useStore } from './store';
import { emitAck } from './socket';
import { Button, Logo } from './components/ui';
import CreateQuiz from './host/CreateQuiz';
import HostGame from './host/HostGame';
import PlayerGame from './player/PlayerGame';

export default function App() {
  const view = useStore((s) => s.view);
  if (view === 'create') return <CreateQuiz />;
  if (view === 'host') return <HostGame />;
  if (view === 'player') return <PlayerGame />;
  return <Home />;
}

function Home() {
  const setView = useStore((s) => s.setView);
  const [pin, setPin] = useState(() => new URLSearchParams(location.search).get('pin') ?? '');
  const [step, setStep] = useState<'pin' | 'name'>(pin.length === 6 ? 'name' : 'pin');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function join() {
    setError('');
    setLoading(true);
    try {
      const id = await emitAck<string>('player:join', { pin, name });
      sessionStorage.setItem('pin', pin);
      sessionStorage.setItem('playerId', id);
      history.replaceState(null, '', '/');
      setView('player');
    } catch (e) {
      setError((e as Error).message);
      if ((e as Error).message.includes('PIN')) setStep('pin');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <Logo className="text-7xl" />
      <form
        className="bg-white rounded-xl p-4 w-full max-w-xs flex flex-col gap-3 shadow-2xl pop"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'pin') {
            if (pin.length === 6) setStep('name');
            else setError('6 оронтой PIN оруулна уу');
          } else join();
        }}
      >
        {step === 'pin' ? (
          <input
            className="text-center text-xl font-bold text-gray-900 border-2 border-gray-300 rounded-md p-3 outline-none focus:border-k-purple"
            placeholder="Game PIN"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        ) : (
          <input
            className="text-center text-xl font-bold text-gray-900 border-2 border-gray-300 rounded-md p-3 outline-none focus:border-k-purple"
            placeholder="Таны нэр"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
        <button
          disabled={loading}
          className="bg-gray-900 text-white font-bold rounded-md p-3 hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
        >
          {step === 'pin' ? 'Оруулах' : loading ? '...' : 'Тоглож эхлэх!'}
        </button>
        {error && <p className="text-k-red text-sm text-center font-semibold">{error}</p>}
      </form>
      <Button variant="ghost" onClick={() => setView('create')}>
        Би хөтлөгч — Quiz үүсгэх →
      </Button>
    </div>
  );
}
