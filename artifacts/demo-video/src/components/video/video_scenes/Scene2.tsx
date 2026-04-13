import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 3000),
      setTimeout(() => setPhase(4), 5000),
      setTimeout(() => setPhase(5), 7000),
      setTimeout(() => setPhase(6), 10500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex overflow-hidden bg-[#0a0e1a]"
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjMyLCAyMzQsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-30" />

      {/* Split Screen Container */}
      <div className="relative z-10 w-full h-full flex">
        {/* Left Side - Terminal */}
        <div className="w-1/2 h-full flex items-center justify-center p-12 relative">
          <motion.div 
            className="w-full max-w-2xl bg-[#111827] rounded-xl border border-[#2D3748] shadow-2xl overflow-hidden"
            initial={{ opacity: 0, x: -50 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 400, damping: 25 }}
          >
            {/* Terminal Header */}
            <div className="h-8 bg-[#2D3748]/50 border-b border-[#2D3748] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-[#FF6B35]/50" />
              <div className="w-3 h-3 rounded-full bg-[#FF6B35]/50" />
              <div className="w-3 h-3 rounded-full bg-[#FF6B35]/50" />
              <span className="ml-2 text-xs font-mono text-[#E8EAFF]/50">agent_node_01.sh</span>
            </div>
            {/* Terminal Body */}
            <div className="p-6 font-mono text-[1.2vw] leading-relaxed">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
              >
                <span className="text-[#7B5FF5]">$</span> curl -X GET /api/services/market/data
              </motion.div>
              
              <AnimatePresence>
                {phase >= 3 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 text-[#FF6B35]"
                  >
                    HTTP 401 Unauthorized
                    <br/>
                    Error: Missing authentication token.
                    <br/>
                    Agent access denied.
                  </motion.div>
                )}
              </AnimatePresence>
              
              {phase >= 4 && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 animate-pulse"
                >
                  <span className="text-[#7B5FF5]">$</span> _
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Side - Broken Nodes */}
        <div className="w-1/2 h-full flex flex-col items-center justify-center p-12 relative">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-[4vw] font-bold text-[#FF6B35] leading-tight font-display uppercase tracking-wider mb-4">
              Broken Trust
            </h2>
            <AnimatePresence mode="popLayout">
              {phase >= 4 && (
                <motion.p 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[2vw] text-[#E8EAFF] font-display"
                >
                  No trust. <span className="text-[#FF6B35]">No payment.</span> No access.
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Broken Connection Animation */}
          <div className="relative w-64 h-64">
            {/* Center Agent Node */}
            <motion.div 
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#7B5FF5] rounded-full z-10 flex items-center justify-center box-shadow-glow"
              initial={{ scale: 0 }}
              animate={phase >= 2 ? { scale: 1 } : { scale: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <div className="w-8 h-8 bg-[#0a0e1a] rounded-full" />
            </motion.div>

            {/* Service Nodes (Broken) */}
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute top-1/2 left-1/2 w-12 h-12 bg-[#2D3748] border-2 border-[#FF6B35] rounded-lg z-10 flex items-center justify-center"
                initial={{ x: '-50%', y: '-50%', scale: 0 }}
                animate={
                  phase >= 5 
                    ? { 
                        x: `calc(-50% + ${Math.cos((i * 120 * Math.PI) / 180) * 150}px)`, 
                        y: `calc(-50% + ${Math.sin((i * 120 * Math.PI) / 180) * 150}px)`,
                        scale: 1,
                        rotate: Math.random() * 45 - 22.5,
                        opacity: 0.5
                      }
                    : phase >= 3
                    ? {
                        x: `calc(-50% + ${Math.cos((i * 120 * Math.PI) / 180) * 100}px)`, 
                        y: `calc(-50% + ${Math.sin((i * 120 * Math.PI) / 180) * 100}px)`,
                        scale: 1
                      }
                    : { x: '-50%', y: '-50%', scale: 0 }
                }
                transition={{ type: 'spring', stiffness: phase >= 5 ? 100 : 300, damping: 20 }}
              />
            ))}
            
            {/* Broken lines */}
            {phase >= 3 && phase < 5 && [0, 1, 2].map((i) => (
              <motion.div
                key={`line-${i}`}
                className="absolute top-1/2 left-1/2 h-0.5 bg-[#FF6B35] origin-left"
                style={{
                  width: '100px',
                  transform: `translateY(-50%) rotate(${i * 120}deg)`,
                }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ opacity: 0 }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
