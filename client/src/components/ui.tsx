import { useEffect, useState } from 'react';

export const COLORS = ['bg-k-red', 'bg-k-blue', 'bg-k-yellow', 'bg-k-green'];

export function Shape({ i, className = 'w-8 h-8' }: { i: number; className?: string }) {
  const shapes = [
    <polygon key="t" points="16,3 30,28 2,28" />,
    <polygon key="d" points="16,2 30,16 16,30 2,16" />,
    <circle key="c" cx="16" cy="16" r="13" />,
    <rect key="s" x="4" y="4" width="24" height="24" />,
  ];
  return (
    <svg viewBox="0 0 32 32" className={className} fill="white">
      {shapes[i]}
    </svg>
  );
}

export function Countdown({ endsAt }: { endsAt: number }) {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))), 200);
    return () => clearInterval(t);
  }, [endsAt]);
  return (
    <div className="w-20 h-20 rounded-full bg-k-purple border-4 border-white flex items-center justify-center text-3xl font-black">
      {left}
    </div>
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
