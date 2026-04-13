import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),  // Stats start counting
      setTimeout(() => setPhase(2), 12000), // Beat B: Cards start appearing
      setTimeout(() => setPhase(3), 13000),
      setTimeout(() => setPhase(4), 14000),
      setTimeout(() => setPhase(5), 15000),
      setTimeout(() => setPhase(6), 16000),
      setTimeout(() => setPhase(7), 23000), // Exiting
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  // Simple counter component
  const Counter = ({ value, duration = 2, decimals = 0, suffix = '', prefix = '' }: any) => {
    const [count, setCount] = useState(0);
    
    useEffect(() => {
      let startTime: number;
      let animationFrame: number;
      
      const updateCount = (timestamp: number) => {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
        
        // Easing function for smooth deceleration
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        setCount(value * easeOutQuart);
        
        if (progress < 1) {
          animationFrame = requestAnimationFrame(updateCount);
        }
      };
      
      animationFrame = requestAnimationFrame(updateCount);
      return () => cancelAnimationFrame(animationFrame);
    }, [value, duration]);

    return <span>{prefix}{count.toFixed(decimals)}{suffix}</span>;
  };

  const services = [
    { name: "Market Data Feed", price: "0.15 USDC", color: "#7B5FF5" },
    { name: "Web Scraper Pro", price: "0.10 USDC", color: "#00D4AA" },
    { name: "Soroban Code Auditor", price: "0.25 USDC", color: "#FF6B35" },
    { name: "Stellar Pathfinder", price: "0.05 USDC", color: "#7B5FF5" },
    { name: "Sentiment Oracle", price: "0.05 USDC", color: "#00D4AA" },
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0e1a] overflow-hidden"
      initial={{ clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ clipPath: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 z-0">
         <img 
          src={`${import.meta.env.BASE_URL}images/dashboard_bg.png`} 
          alt="Dashboard Texture" 
          className="w-full h-full object-cover opacity-20 mix-blend-screen"
        />
      </div>

      <div className="relative z-10 w-full h-full p-16 flex flex-col justify-between">
        {/* Top Header */}
        <motion.div 
          className="flex justify-between items-end mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className="text-[3vw] font-black text-[#E8EAFF] uppercase font-display">
            Live Network
          </h2>
          <div className="flex items-center gap-3 bg-[#111827]/80 backdrop-blur border border-[#2D3748] px-4 py-2 rounded-full">
            <div className="w-3 h-3 rounded-full bg-[#00D4AA] animate-pulse" />
            <span className="text-[#00D4AA] font-mono text-sm">MAINNET ACTIVE</span>
          </div>
        </motion.div>

        {/* BEAT A: Stats */}
        <div className="grid grid-cols-4 gap-6 mb-16">
          <motion.div 
            className="bg-[#111827]/90 backdrop-blur border border-[#2D3748] p-8 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="text-[#E8EAFF]/60 font-mono text-sm mb-4">ACTIVE AGENTS</div>
            <div className="text-[4vw] font-bold text-[#7B5FF5] font-display">
              {phase >= 1 ? <Counter value={3} duration={2} /> : "0"}
            </div>
          </motion.div>
          <motion.div 
            className="bg-[#111827]/90 backdrop-blur border border-[#2D3748] p-8 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="text-[#E8EAFF]/60 font-mono text-sm mb-4">TRANSACTIONS</div>
            <div className="text-[4vw] font-bold text-[#E8EAFF] font-display">
              {phase >= 1 ? <Counter value={24} duration={3} /> : "0"}
            </div>
          </motion.div>
          <motion.div 
            className="bg-[#111827]/90 backdrop-blur border border-[#2D3748] p-8 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
            <div className="text-[#E8EAFF]/60 font-mono text-sm mb-4">TOTAL VOLUME</div>
            <div className="text-[4vw] font-bold text-[#00D4AA] font-display flex items-baseline gap-2">
              {phase >= 1 ? <Counter value={3.55} decimals={2} duration={3.5} /> : "0.00"}
              <span className="text-xl">USDC</span>
            </div>
          </motion.div>
          <motion.div 
            className="bg-[#111827]/90 backdrop-blur border border-[#2D3748] p-8 rounded-xl shadow-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, delay: 0.8 }}
          >
            <div className="text-[#E8EAFF]/60 font-mono text-sm mb-4">AVG REPUTATION</div>
            <div className="text-[4vw] font-bold text-[#FF6B35] font-display flex items-baseline gap-2">
              {phase >= 1 ? <Counter value={5.5} decimals={1} duration={4} /> : "0.0"}
              <span className="text-xl">/100</span>
            </div>
          </motion.div>
        </div>

        {/* BEAT B: Marketplace Cards */}
        <div className="flex-1 relative">
          <h3 className="text-[2vw] text-[#E8EAFF] font-display mb-6 opacity-80">Marketplace</h3>
          <div className="flex flex-wrap gap-6">
            {services.map((service, i) => (
              <motion.div
                key={i}
                className="bg-[#111827]/80 backdrop-blur border border-[#2D3748] rounded-xl p-6 w-[calc(33.33%-1rem)] relative overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, x: 50 }}
                animate={phase >= (i + 2) ? { opacity: 1, scale: 1, x: 0 } : { opacity: 0, scale: 0.9, x: 50 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className={`absolute top-0 left-0 w-1 h-full`} style={{ backgroundColor: service.color }} />
                <div className="flex justify-between items-start mb-4">
                  <h4 className="text-xl font-bold text-[#E8EAFF] w-2/3 leading-tight">{service.name}</h4>
                  <div className="text-[#00D4AA] font-mono font-bold bg-[#00D4AA]/10 px-3 py-1 rounded text-sm whitespace-nowrap">
                    {service.price}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-8">
                  <div className="w-2 h-2 rounded-full bg-[#00D4AA] shadow-[0_0_8px_#00D4AA]" />
                  <span className="text-xs text-[#E8EAFF]/50 font-mono">LIVE</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
