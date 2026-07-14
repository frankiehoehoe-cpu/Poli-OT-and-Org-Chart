import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Play } from 'lucide-react';

const IDLE_DELAY_MS = 650;

const getCorgiSize = () => {
  const width = Math.min(Math.max(window.innerWidth * 0.24, 176), 320);
  return { width, height: width * (280 / 360) };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getCorgiPosition = (x: number, y: number): Point => {
  const { width, height } = getCorgiSize();
  const margin = 12;

  return {
    x: clamp(x - width * 0.47, margin, window.innerWidth - width - margin),
    y: clamp(y - height * 0.74, margin, window.innerHeight - height - margin),
  };
};

type Point = {
  x: number;
  y: number;
};

function TransparentCorgi({ isIdle, flip }: { isIdle: boolean; flip: boolean }) {
  return (
    <motion.svg
      className="welcome-corgi"
      viewBox="0 0 360 280"
      role="img"
      aria-label="A cheerful transparent-background corgi mascot"
      animate={{ scaleX: flip ? -1 : 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      <g className={isIdle ? 'corgi-idle' : undefined}>
        <motion.g
          className="corgi-tail"
          style={{ transformOrigin: '82px 138px' }}
          animate={isIdle ? { rotate: [-22, 20, -18, 22, -22] } : { rotate: -8 }}
          transition={isIdle ? { duration: 0.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
        >
          <path d="M96 142C55 126 42 90 68 68c23-20 55 1 43 28-7 16-25 12-31 2" fill="none" stroke="#f59e0b" strokeWidth="26" strokeLinecap="round" />
          <path d="M96 142C55 126 42 90 68 68" fill="none" stroke="#fff7ed" strokeWidth="12" strokeLinecap="round" />
        </motion.g>

        <ellipse cx="184" cy="178" rx="98" ry="54" fill="#f59e0b" />
        <path d="M102 164c25 42 92 61 154 37 7 34-27 56-78 56-55 0-91-28-76-93Z" fill="#fff7ed" />
        <ellipse cx="184" cy="177" rx="68" ry="36" fill="#fbbf24" opacity="0.35" />

        <g fill="#b45309">
          <rect x="113" y="210" width="28" height="44" rx="14" />
          <rect x="223" y="210" width="28" height="44" rx="14" />
        </g>
        <g fill="#fff7ed">
          <ellipse cx="127" cy="252" rx="22" ry="12" />
          <ellipse cx="237" cy="252" rx="22" ry="12" />
        </g>

        <motion.g
          className="corgi-head"
          style={{ transformOrigin: '210px 104px' }}
          animate={isIdle ? { rotate: [0, -7, 7, 0], y: [0, -2, 0] } : { rotate: 0, y: 0 }}
          transition={isIdle ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
        >
          <path d="M135 82 101 28c-5-8 4-17 12-12l59 36Z" fill="#f59e0b" />
          <path d="M274 82 309 28c5-8-4-17-12-12l-59 36Z" fill="#f59e0b" />
          <path d="M123 78 107 38l43 34Z" fill="#fde68a" />
          <path d="M286 38 258 78l-27-6Z" fill="#fde68a" />
          <rect x="115" y="50" width="184" height="128" rx="62" fill="#f59e0b" />
          <path d="M139 96c24-34 107-34 132 0v34c0 42-30 66-66 66s-66-24-66-66Z" fill="#fff7ed" />
          <circle cx="164" cy="108" r="12" fill="#1f2937" />
          <circle cx="246" cy="108" r="12" fill="#1f2937" />
          <circle cx="168" cy="104" r="4" fill="white" />
          <circle cx="250" cy="104" r="4" fill="white" />
          <path d="M190 128c5-10 25-10 30 0 2 5-4 12-15 12s-18-7-15-12Z" fill="#111827" />
          <path d="M205 140c-2 16-15 24-31 16" fill="none" stroke="#7c2d12" strokeWidth="5" strokeLinecap="round" />
          <path d="M205 140c2 16 15 24 31 16" fill="none" stroke="#7c2d12" strokeWidth="5" strokeLinecap="round" />
          <motion.path
            d="M203 159c9 18 31 12 29-6-9 4-18 5-29 6Z"
            fill="#fb7185"
            animate={isIdle ? { scaleY: [0.45, 1, 0.65, 1] } : { scaleY: 0.45 }}
            style={{ transformOrigin: '217px 154px' }}
            transition={isIdle ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          />
          <path d="M144 77c17-10 38-15 62-15s45 5 62 15" fill="none" stroke="#fbbf24" strokeWidth="10" strokeLinecap="round" opacity="0.55" />
        </motion.g>
      </g>
    </motion.svg>
  );
}

export default function WelcomePage() {
  const navigate = useNavigate();
  const [corgiPosition, setCorgiPosition] = useState<Point>({ x: 0, y: 0 });
  const [isIdle, setIsIdle] = useState(true);
  const [flip, setFlip] = useState(false);
  const previousX = useRef(0);
  const idleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const setInitialPosition = () => {
      const x = window.innerWidth * 0.68;
      const y = window.innerHeight * 0.48;
      previousX.current = x;
      setCorgiPosition(getCorgiPosition(x, y));
    };

    const handlePointerMove = (event: PointerEvent) => {
      setCorgiPosition(getCorgiPosition(event.clientX, event.clientY));
      setFlip(event.clientX < previousX.current);
      previousX.current = event.clientX;
      setIsIdle(false);

      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
      }

      idleTimer.current = window.setTimeout(() => setIsIdle(true), IDLE_DELAY_MS);
    };

    setInitialPosition();
    window.addEventListener('resize', setInitialPosition);
    window.addEventListener('pointermove', handlePointerMove);

    return () => {
      window.removeEventListener('resize', setInitialPosition);
      window.removeEventListener('pointermove', handlePointerMove);
      if (idleTimer.current) {
        window.clearTimeout(idleTimer.current);
      }
    };
  }, []);

  return (
    <main className="welcome-page min-h-screen bg-[#0f172a] flex items-center justify-center p-6 overflow-hidden">
      <motion.section
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-3xl text-center"
      >
        <p className="text-amber-300 font-black uppercase tracking-[0.45em] text-xs mb-5">By FH Ver 1.1.14 PRO</p>
        <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-white uppercase drop-shadow-2xl">OT PRO</h1>
        <p className="mt-4 text-lg md:text-2xl text-slate-300 font-bold uppercase tracking-[0.18em]">Overtime Tracker & Org Chart</p>
        <p className="mt-5 mx-auto max-w-2xl text-slate-400 leading-8 font-medium">
          Plan overtime, review rosters, and enter the public overview while your corgi assistant follows along.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-12 mx-auto w-full max-w-xs"
        >
          <button
            onClick={() => navigate('/overview')}
            className="group relative w-full py-6 bg-vibrant text-white font-black text-2xl uppercase tracking-[0.2em] rounded-[30px] shadow-[0_20px_50px_-12px_rgba(79,70,229,0.5)] hover:bg-white hover:text-vibrant transition-all duration-300 active:scale-95 flex items-center justify-center gap-4 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
            <span>START</span>
            <Play className="w-8 h-8 fill-current" />
          </button>

          <p className="mt-6 text-slate-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">
            Click to enter Public Overview
          </p>
        </motion.div>
      </motion.section>

      <motion.div
        className="corgi-follow-layer pointer-events-none fixed z-20"
        animate={{ x: corgiPosition.x, y: corgiPosition.y }}
        transition={{ type: 'spring', stiffness: 85, damping: 18, mass: 0.55 }}
      >
        <TransparentCorgi isIdle={isIdle} flip={flip} />
      </motion.div>

      <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full opacity-20 animate-ping" />
      <div className="absolute bottom-20 right-20 w-3 h-3 bg-white rounded-full opacity-10 animate-pulse" />
      <div className="absolute top-1/4 right-1/4 w-1 h-1 bg-amber-400 rounded-full opacity-30" />
    </main>
  );
}
