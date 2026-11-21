import { useEffect, useState } from 'react';
import { serverNow } from '../store';

export const COLORS = ['bg-k-red', 'bg-k-blue', 'bg-k-yellow', 'bg-k-green'];

export function Shape({ i, className = 'w-8 h-8' }: { i: number; className?: string }) {
  const shapes = [
    <polygon key="t" points="16,3 30,28 2,28" />,
    <polygon key="d" points="16,2 30,16 16,30 2,16" />,
    <circle key="c" cx="16" cy="16" r="13" />,
    <rect key="s" x="4" y="4" width="24" height="24" />,
  ];
  return (
    <svg viewBox="0 0 32 32" className={className} fill="white" aria-hidden>
      {shapes[i]}
    </svg>
  );
}

/** Milliseconds left until a server timestamp; re-renders ~5×/s. */
export function useRemaining(endsAt: number | null, frozenMs?: number | null) {
  const calc = () => (frozenMs != null ? frozenMs : endsAt ? Math.max(0, endsAt - serverNow()) : 0);
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    setLeft(calc());
    if (frozenMs != null) return;
    const t = setInterval(() => setLeft(calc()), 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt, frozenMs]);
  return left;
}

export function Countdown({ endsAt, frozenMs, className = '' }: { endsAt: number | null; frozenMs?: number | null; className?: string }) {
  const left = useRemaining(endsAt, frozenMs);
  return (
    <div className={`w-20 h-20 rounded-full bg-k-purple border-4 border-white flex items-center justify-center text-3xl font-black tabular-nums ${className}`}>
      {Math.ceil(left / 1000)}
    </div>
  );
}

/** Thin bar showing time left in an automatic phase (results / leaderboard). */
export function AutoBar({ endsAt, totalMs, paused, frozenMs }: { endsAt: number | null; totalMs: number; paused: boolean; frozenMs?: number | null }) {
  const left = useRemaining(endsAt, paused ? frozenMs ?? 0 : null);
  return (
    <div className="h-1.5 w-full bg-white/20 overflow-hidden">
      <div className={`h-full ${paused ? 'bg-yellow-300' : 'bg-white'} transition-[width] duration-200 ease-linear`} style={{ width: `${Math.min(100, (left / totalMs) * 100)}%` }} />
    </div>
  );
}

export function CodeBlock({ code, className = '' }: { code: string; className?: string }) {
  return (
    <pre className={`bg-gray-950 text-gray-100 text-left rounded-lg p-4 overflow-x-auto font-mono text-sm md:text-base leading-relaxed ${className}`}>
      <code>{code}</code>
    </pre>
  );
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const { variant = 'primary', className = '', ...rest } = props;
  const base = 'rounded-lg px-6 py-3 font-bold transition active:translate-y-0.5 disabled:opacity-50 cursor-pointer';
  const styles =
    variant === 'primary'
      ? 'bg-white text-k-purple shadow-[0_4px_0_#bbb] hover:bg-gray-100'
      : 'bg-white/15 text-white hover:bg-white/25';
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Logo({ className = 'text-5xl' }: { className?: string }) {
  return <h1 className={`font-black tracking-tight ${className}`}>QUIZ!</h1>;
}
