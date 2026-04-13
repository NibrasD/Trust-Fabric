import { motion } from 'framer-motion';

export function WalkIntro() {
  return (
    <motion.div
      className="w-full h-full flex flex-col items-center justify-center bg-[#0a0e1a] relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Animated grid background */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(#7B5FF5 1px, transparent 1px), linear-gradient(90deg, #7B5FF5 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }}
      />

      {/* Radial glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(123,95,245,0.25) 0%, transparent 70%)' }}
      />

      {/* Logo badge */}
      <motion.div
        className="mb-6 px-4 py-1.5 border border-[#7B5FF5]/50 rounded-full text-xs font-mono text-[#7B5FF5] bg-[#7B5FF5]/10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        STELLAR AGENTS × x402 HACKATHON
      </motion.div>

      <motion.h1
        className="text-6xl font-black text-white tracking-tight text-center leading-tight mb-3"
        style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7 }}
      >
        Trust Fabric
      </motion.h1>

      <motion.p
        className="text-xl text-[#E8EAFF]/60 mb-10 font-light"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
      >
        Full Platform Walkthrough
      </motion.p>

      {/* Chapter list */}
      <motion.div
        className="flex flex-col gap-2 text-sm font-mono text-[#E8EAFF]/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.6 }}
      >
        {[
          'Landing Page',
          'Dashboard',
          'Agents & Sessions',
          'Demo Lab  →  x402 in action',
          'Stellar Lab  →  live 402 challenge',
          'Marketplace  +  MCP Server',
        ].map((item, i) => (
          <motion.div
            key={item}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2 + i * 0.12, duration: 0.4 }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />
            <span>{item}</span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
