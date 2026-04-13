import { motion } from 'framer-motion';

const CONTRACTS = [
  { label: 'Reputation Contract', addr: 'CAXV62II...', color: '#7B5FF5' },
  { label: 'Registry Contract', addr: 'CDG7G7MB...', color: '#00D4AA' },
  { label: 'Session Policy', addr: 'CAKSBWFS...', color: '#FF6B35' },
];

export function WalkOutro() {
  return (
    <motion.div
      className="w-full h-full flex flex-col items-center justify-center bg-[#0a0e1a] relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Animated radial glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{ opacity: [0.4, 0.8, 0.4] }}
        transition={{ duration: 4, repeat: Infinity }}
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 50%, rgba(0,212,170,0.18) 0%, rgba(123,95,245,0.12) 40%, transparent 70%)' }}
      />

      {/* Soroban contracts */}
      <motion.div
        className="mb-8 flex flex-col gap-3 w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.6 }}
      >
        <div className="text-center text-[10px] font-mono text-[#E8EAFF]/40 uppercase tracking-widest mb-1">Soroban Smart Contracts — Live on Testnet</div>
        {CONTRACTS.map((c, i) => (
          <motion.div
            key={c.label}
            className="flex items-center justify-between px-4 py-2.5 rounded-lg border"
            style={{ borderColor: `${c.color}30`, background: `${c.color}08` }}
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 + i * 0.2, duration: 0.4 }}
          >
            <span className="text-sm text-[#E8EAFF]/70">{c.label}</span>
            <span className="font-mono text-xs" style={{ color: c.color }}>{c.addr}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* Main closing text */}
      <motion.div
        className="text-center mb-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.4, duration: 0.7 }}
      >
        <h2
          className="text-4xl font-black text-white leading-tight mb-2"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
        >
          Autonomous Agents.
          <br />
          <span style={{ color: '#00D4AA' }}>Real Payments.</span>
          <br />
          <span style={{ color: '#7B5FF5' }}>Zero Trust Required.</span>
        </h2>
      </motion.div>

      {/* Tech pills */}
      <motion.div
        className="flex flex-wrap gap-2 justify-center mb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.0, duration: 0.6 }}
      >
        {['x402 Protocol', 'Soroban Smart Contracts', 'USDC Micropayments', 'MPP Split Payments', 'MCP Server', 'Stellar Testnet'].map((tag) => (
          <span key={tag} className="px-3 py-1 rounded-full text-xs font-mono border border-[#2d3748] text-[#E8EAFF]/60 bg-[#111827]">
            {tag}
          </span>
        ))}
      </motion.div>

      {/* Hackathon badge */}
      <motion.div
        className="px-6 py-2.5 border border-[#7B5FF5]/50 rounded-full bg-[#7B5FF5]/10 flex items-center gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.5 }}
      >
        <div className="w-2 h-2 rounded-full bg-[#7B5FF5] animate-pulse" />
        <span className="text-sm font-mono text-[#7B5FF5] font-semibold">Stellar Agents × x402 Hackathon 2025</span>
        <div className="w-2 h-2 rounded-full bg-[#7B5FF5] animate-pulse" />
      </motion.div>

      {/* Built on Stellar wordmark */}
      <motion.div
        className="mt-6 text-[#E8EAFF]/30 text-xs font-mono"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.2, duration: 0.5 }}
      >
        Built on ✦ Stellar
      </motion.div>
    </motion.div>
  );
}
