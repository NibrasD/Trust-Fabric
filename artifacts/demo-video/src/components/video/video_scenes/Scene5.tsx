import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1000), // Proof of work headline
      setTimeout(() => setPhase(2), 2500), // Contracts scroll
      setTimeout(() => setPhase(3), 8000), // Session token
      setTimeout(() => setPhase(4), 12000), // Final Bold Closing
      setTimeout(() => setPhase(5), 16000), // Hackathon badge
      setTimeout(() => setPhase(6), 22000), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const contracts = [
    { name: "Reputation", address: "CAXV62II..." },
    { name: "Registry", address: "CDG7G7MB..." },
    { name: "Session Policy", address: "CAKSBWFS..." }
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a] overflow-hidden"
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Animated Mesh */}
      <div className="absolute inset-0 z-0 opacity-20">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-[#7B5FF5]"
            initial={{
              x: `${Math.random() * 100}vw`,
              y: `${Math.random() * 100}vh`,
            }}
            animate={{
              x: `${Math.random() * 100}vw`,
              y: `${Math.random() * 100}vh`,
            }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center p-16">
        
        {/* Part 1: Proof of Work & Contracts */}
        <AnimatePresence>
          {phase >= 1 && phase < 4 && (
            <motion.div 
              className="absolute inset-0 flex flex-col items-center justify-center"
              initial={{ opacity: 0, scale: 1.1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
              transition={{ duration: 1 }}
            >
              <h2 className="text-[5vw] font-black text-[#E8EAFF] font-display uppercase tracking-widest mb-12">
                Proof of Work
              </h2>

              <div className="flex flex-col gap-6 w-full max-w-3xl">
                {contracts.map((contract, i) => (
                  <motion.div 
                    key={i}
                    className="flex justify-between items-center bg-[#111827] border border-[#2D3748] p-6 rounded-lg"
                    initial={{ opacity: 0, x: -50 }}
                    animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: -50 }}
                    transition={{ delay: i * 0.3, type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <span className="text-[#00D4AA] font-display text-xl uppercase tracking-wider">{contract.name}</span>
                    <span className="text-[#E8EAFF] font-mono text-xl">{contract.address}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div 
                className="mt-12 bg-[#2D3748]/50 border border-[#7B5FF5]/50 p-4 rounded-lg font-mono text-[#E8EAFF]"
                initial={{ opacity: 0, y: 20 }}
                animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              >
                <span className="text-[#7B5FF5] mr-2">Session Token:</span>
                stf_6e2eb54e...
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Part 2: Final Closing */}
        <AnimatePresence>
          {phase >= 4 && (
            <motion.div 
              className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5 }}
            >
              <div className="text-center">
                <motion.div 
                  className="text-[4vw] font-black text-[#E8EAFF] font-display leading-tight mb-2"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 1 }}
                >
                  Autonomous Agents.
                </motion.div>
                <motion.div 
                  className="text-[4vw] font-black text-[#00D4AA] font-display leading-tight mb-2"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.5, duration: 1 }}
                >
                  Real Payments.
                </motion.div>
                <motion.div 
                  className="text-[4vw] font-black text-[#FF6B35] font-display leading-tight mb-16"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.5, duration: 1 }}
                >
                  Zero Trust Required.
                </motion.div>
              </div>

              <motion.div 
                className="flex items-center gap-6 mt-12"
                initial={{ opacity: 0, filter: 'blur(10px)' }}
                animate={phase >= 5 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(10px)' }}
                transition={{ duration: 1.5 }}
              >
                <div className="px-6 py-3 border-2 border-[#7B5FF5] rounded-full bg-[#111827] text-[#7B5FF5] font-mono tracking-widest uppercase font-bold text-xl">
                  Stellar Hackathon x402
                </div>
                <div className="h-12 w-px bg-[#2D3748]" />
                <div className="text-[#E8EAFF] font-display font-bold text-2xl tracking-wider">
                  Built on Stellar
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </motion.div>
  );
}
