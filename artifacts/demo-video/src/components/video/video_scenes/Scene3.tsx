import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 5500),
      setTimeout(() => setPhase(4), 8500),
      setTimeout(() => setPhase(5), 11500),
      setTimeout(() => setPhase(6), 14500),
      setTimeout(() => setPhase(7), 16500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a] overflow-hidden"
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#7B5FF5]/10 via-[#0a0e1a] to-[#0a0e1a] opacity-50" />

      <motion.h2 
        className="absolute top-[10%] text-[4vw] font-black text-[#E8EAFF] tracking-widest uppercase font-display"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        The x402 Protocol
      </motion.h2>

      {/* Main Flow Diagram */}
      <div className="relative w-3/4 max-w-5xl h-[60vh] mt-[10vh] flex flex-col justify-between">
        
        {/* Step 1: GET Request */}
        <motion.div 
          className="flex items-center gap-6"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-16 h-16 rounded-lg bg-[#2D3748] border border-[#7B5FF5] flex items-center justify-center font-bold text-xl text-[#7B5FF5]">
            1
          </div>
          <div className="flex-1 bg-[#111827] p-4 rounded-lg border border-[#2D3748] font-mono text-[1.2vw]">
            <span className="text-[#00D4AA]">GET</span> /api/services/market/data
          </div>
        </motion.div>

        {/* Step 2: 402 Payment Required */}
        <motion.div 
          className="flex items-center gap-6 ml-[10%]"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-16 h-16 rounded-lg bg-[#FF6B35]/20 border border-[#FF6B35] flex items-center justify-center font-bold text-xl text-[#FF6B35]">
            2
          </div>
          <div className="flex-1 bg-[#111827] p-4 rounded-lg border border-[#FF6B35]/50 font-mono text-[1.2vw] flex justify-between items-center relative overflow-hidden">
            <span className="text-[#FF6B35] z-10 relative">402 Payment Required</span>
            <span className="text-[#E8EAFF]/60 text-sm z-10 relative">Cost: 0.15 USDC</span>
            <motion.div 
              className="absolute inset-0 bg-[#FF6B35]/10"
              initial={{ scaleX: 0, originX: 0 }}
              animate={phase >= 2 ? { scaleX: 1 } : { scaleX: 0 }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        {/* Step 3: Sign Stellar Tx */}
        <motion.div 
          className="flex items-center gap-6 ml-[20%]"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 3 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-16 h-16 rounded-lg bg-[#7B5FF5]/20 border border-[#7B5FF5] flex items-center justify-center font-bold text-xl text-[#7B5FF5]">
            3
          </div>
          <div className="flex-1 bg-[#111827] p-4 rounded-lg border border-[#7B5FF5]/50 font-mono text-[1vw] relative overflow-hidden">
            <div className="text-[#7B5FF5] mb-2">Agent signs Stellar tx</div>
            <div className="text-[#E8EAFF]/50 text-xs truncate">
              {phase >= 3 && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ staggerChildren: 0.05 }}
                >
                  hash: 0x8f2a... ecdsa_secp256k1
                </motion.span>
              )}
            </div>
            {/* Hex hex hash scrolling simulation */}
            {phase >= 3 && (
               <motion.div 
                 className="absolute bottom-0 left-0 h-1 bg-[#7B5FF5]"
                 initial={{ width: 0 }}
                 animate={{ width: '100%' }}
                 transition={{ duration: 2.5, ease: 'linear' }}
               />
            )}
          </div>
        </motion.div>

        {/* Step 4: POST with X-PAYMENT */}
        <motion.div 
          className="flex items-center gap-6 ml-[10%]"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 4 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-16 h-16 rounded-lg bg-[#2D3748] border border-[#7B5FF5] flex items-center justify-center font-bold text-xl text-[#7B5FF5]">
            4
          </div>
          <div className="flex-1 bg-[#111827] p-4 rounded-lg border border-[#2D3748] font-mono text-[1.2vw]">
            <div className="text-[#00D4AA] mb-1"><span className="text-[#E8EAFF]">POST</span> /api/services/market/data</div>
            <div className="text-[#E8EAFF]/70 text-sm">X-PAYMENT: A1B2C3D4...</div>
          </div>
        </motion.div>

        {/* Step 5: Verify & 200 OK */}
        <motion.div 
          className="flex items-center gap-6"
          initial={{ opacity: 0, x: -50 }}
          animate={phase >= 5 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          <div className="w-16 h-16 rounded-lg bg-[#00D4AA]/20 border border-[#00D4AA] flex items-center justify-center font-bold text-xl text-[#00D4AA]">
            5
          </div>
          <div className="flex-1 bg-[#111827] p-4 rounded-lg border border-[#00D4AA]/50 font-mono text-[1.2vw] flex justify-between items-center relative overflow-hidden">
            <div>
              <span className="text-[#00D4AA] font-bold">✓ Horizon verifies</span>
              <span className="text-[#E8EAFF]/60 text-sm ml-4">200 OK</span>
            </div>
            {phase >= 5 && (
              <motion.div
                className="absolute inset-0 bg-[#00D4AA]/10"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 1 }}
              />
            )}
          </div>
        </motion.div>

        {/* Connecting Lines SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none -z-10" style={{ left: '32px' }}>
          <motion.path 
            d="M 32 64 L 32 120 L 132 120 L 132 176" 
            fill="none" 
            stroke="#2D3748" 
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={phase >= 2 ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.5 }}
          />
           <motion.path 
            d="M 132 176 L 132 232 L 232 232 L 232 288" 
            fill="none" 
            stroke="#2D3748" 
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={phase >= 3 ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.5 }}
          />
           <motion.path 
            d="M 232 288 L 232 344 L 132 344 L 132 400" 
            fill="none" 
            stroke="#2D3748" 
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={phase >= 4 ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.5 }}
          />
           <motion.path 
            d="M 132 400 L 132 456 L 32 456 L 32 512" 
            fill="none" 
            stroke="#2D3748" 
            strokeWidth="2"
            initial={{ pathLength: 0 }}
            animate={phase >= 5 ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.5 }}
          />
        </svg>

      </div>
    </motion.div>
  );
}
