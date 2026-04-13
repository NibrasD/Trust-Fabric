import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 2500),
      setTimeout(() => setPhase(4), 8500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#0a0e1a]">
        <img 
          src={`${import.meta.env.BASE_URL}images/space_particles.png`} 
          alt="Space particles" 
          className="w-full h-full object-cover opacity-30 mix-blend-screen"
        />
        <motion.div 
          className="absolute inset-0 bg-[#7B5FF5]/10"
          animate={{ opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Badge */}
      <motion.div 
        className="absolute top-[8vh] right-[5vw] px-4 py-2 border border-[#7B5FF5] rounded-full bg-[#111827]/80 backdrop-blur-sm z-20 flex items-center gap-2"
        initial={{ opacity: 0, y: -20 }}
        animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 400, damping: 25 }}
      >
        <div className="w-2 h-2 rounded-full bg-[#00D4AA] animate-pulse" />
        <span className="text-[1vw] font-mono text-[#00D4AA] uppercase tracking-wider">Stellar Hackathon</span>
      </motion.div>

      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        <motion.h1 
          className="text-[6vw] font-black tracking-tighter text-[#E8EAFF] leading-none mb-6"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {['STELLAR', 'AGENT', 'TRUST', 'FABRIC'].map((word, i) => (
            <motion.div 
              key={i} 
              className="overflow-hidden inline-block mr-4"
              initial={{ opacity: 0, y: 50, rotateX: -20 }}
              animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: -20 }}
              transition={{ 
                type: 'spring', stiffness: 300, damping: 20, 
                delay: phase >= 2 ? i * 0.15 : 0 
              }}
            >
              {word}
            </motion.div>
          ))}
        </motion.h1>
        
        <motion.div 
          className="overflow-hidden"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p className="text-[1.8vw] text-[#7B5FF5] font-mono font-bold tracking-widest uppercase">
            x402 Micropayments for Autonomous AI Agents
          </p>
        </motion.div>
      </div>

    </motion.div>
  );
}
