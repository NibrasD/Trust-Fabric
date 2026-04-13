import { motion, useAnimation } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Highlight {
  x: number;
  y: number;
  label?: string;
  delay?: number;
  color?: string;
}

interface CursorStep {
  x: number;
  y: number;
  delay: number;
  click?: boolean;
}

interface ScreenSceneProps {
  image: string;
  caption: string;
  subcaption?: string;
  zoomFrom?: { x: number; y: number; scale: number };
  zoomTo?: { x: number; y: number; scale: number };
  highlights?: Highlight[];
  cursor?: CursorStep[];
  page?: string;
}

export function ScreenScene({
  image,
  caption,
  subcaption,
  zoomFrom = { x: 0, y: 0, scale: 1 },
  zoomTo = { x: 0, y: 0, scale: 1.08 },
  highlights = [],
  cursor = [],
  page,
}: ScreenSceneProps) {
  const [cursorPos, setCursorPos] = useState({ x: cursor[0]?.x ?? 50, y: cursor[0]?.y ?? 50 });
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    if (!cursor.length) return;
    cursor.forEach((step, i) => {
      const t = setTimeout(() => {
        setCursorPos({ x: step.x, y: step.y });
        if (step.click) {
          setClicking(true);
          setTimeout(() => setClicking(false), 300);
        }
      }, step.delay);
      return () => clearTimeout(t);
    });
  }, []);

  return (
    <motion.div
      className="w-full h-full relative overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Screenshot with Ken Burns zoom/pan */}
      <motion.div
        className="absolute inset-0"
        initial={{ scale: zoomFrom.scale, x: `${zoomFrom.x}%`, y: `${zoomFrom.y}%` }}
        animate={{ scale: zoomTo.scale, x: `${zoomTo.x}%`, y: `${zoomTo.y}%` }}
        transition={{ duration: 12, ease: 'linear' }}
      >
        <img
          src={image}
          className="w-full h-full object-cover object-top"
          alt=""
          draggable={false}
        />
      </motion.div>

      {/* Subtle dark overlay */}
      <div className="absolute inset-0 bg-black/10 pointer-events-none" />

      {/* Page label top-right */}
      {page && (
        <motion.div
          className="absolute top-3 right-4 px-3 py-1 rounded-full text-xs font-mono bg-[#0a0e1a]/80 border border-[#2d3748] text-[#7B5FF5] z-20"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          {page}
        </motion.div>
      )}

      {/* Highlight circles */}
      {highlights.map((h, i) => (
        <motion.div
          key={i}
          className="absolute z-20 pointer-events-none"
          style={{ left: `${h.x}%`, top: `${h.y}%`, transform: 'translate(-50%, -50%)' }}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1, 1, 0.8] }}
          transition={{ delay: h.delay ?? 0.8 + i * 0.4, duration: 0.5, times: [0, 0.2, 0.8, 1] }}
        >
          <div
            className="w-12 h-12 rounded-full border-2 opacity-80"
            style={{ borderColor: h.color ?? '#00D4AA', boxShadow: `0 0 20px ${h.color ?? '#00D4AA'}60` }}
          />
          {h.label && (
            <div
              className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#0a0e1a', color: h.color ?? '#00D4AA', border: `1px solid ${h.color ?? '#00D4AA'}50` }}
            >
              {h.label}
            </div>
          )}
        </motion.div>
      ))}

      {/* Animated Cursor */}
      {cursor.length > 0 && (
        <motion.div
          className="absolute z-30 pointer-events-none"
          animate={{ left: `${cursorPos.x}%`, top: `${cursorPos.y}%` }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          style={{ transform: 'translate(-4px, -4px)' }}
        >
          <motion.svg
            width="20" height="20" viewBox="0 0 20 20" fill="none"
            animate={{ scale: clicking ? 0.7 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <path d="M3 2L17 10L10 11L8 18L3 2Z" fill="white" stroke="#0a0e1a" strokeWidth="1.5" strokeLinejoin="round" />
          </motion.svg>
          {clicking && (
            <motion.div
              className="absolute top-0 left-0 w-8 h-8 rounded-full border-2 border-[#7B5FF5]"
              initial={{ scale: 0.3, opacity: 0.8 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{ transform: 'translate(-30%, -30%)' }}
            />
          )}
        </motion.div>
      )}

      {/* Caption bar */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-30 px-8 py-5"
        style={{ background: 'linear-gradient(to top, rgba(10,14,26,0.97) 0%, rgba(10,14,26,0.7) 80%, transparent 100%)' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
      >
        <div className="flex items-start gap-3">
          <div className="w-1 h-10 rounded-full bg-[#7B5FF5] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-white text-lg font-semibold leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {caption}
            </p>
            {subcaption && (
              <p className="text-[#E8EAFF]/50 text-sm mt-0.5 font-mono">{subcaption}</p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
