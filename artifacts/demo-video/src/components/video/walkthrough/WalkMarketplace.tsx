import { motion } from 'framer-motion';

export function WalkMarketplace() {
  const services = [
    { name: 'Sentiment Oracle', price: '0.15 USDC', cat: 'AI', endpoint: '/api/services/sentiment' },
    { name: 'Soroban Code Auditor', price: '0.50 USDC', cat: 'Security', endpoint: '/api/services/audit' },
    { name: 'Stellar Pathfinder', price: '0.02 USDC', cat: 'Finance', endpoint: '/api/services/pathfinder' },
    { name: 'Web Scraper Pro', price: '0.08 USDC', cat: 'Data', endpoint: '/api/services/scraper' },
    { name: 'AI Summarizer', price: '0.10 USDC', cat: 'AI', endpoint: '/api/services/paid/summarize' },
    { name: 'Market Data Feed', price: '0.05 USDC', cat: 'Data', endpoint: '/api/services/market/data' },
  ];

  const catColors: Record<string, string> = {
    AI: '#7B5FF5',
    Security: '#FF6B35',
    Finance: '#00D4AA',
    Data: '#FEBC2E',
  };

  return (
    <motion.div
      className="w-full h-full bg-[#0a0e1a] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Top section: split screenshot / annotation */}
      <div className="relative flex-1 overflow-hidden">
        <motion.div
          className="absolute inset-0"
          initial={{ scale: 1, y: 0 }}
          animate={{ scale: 1.1, y: -30 }}
          transition={{ duration: 12, ease: 'linear' }}
        >
          <img src="/demo-video/screens/06_explore.jpg" className="w-full h-full object-cover object-top" alt="" draggable={false} />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0e1a]/30 to-[#0a0e1a]" />

        <motion.div
          className="absolute top-3 right-4 px-3 py-1 rounded-full text-xs font-mono bg-[#0a0e1a]/80 border border-[#2d3748] text-[#7B5FF5] z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          /explore · /services
        </motion.div>

        <motion.div
          className="absolute top-3 left-4 z-20 text-xl font-bold text-white"
          style={{ fontFamily: 'Space Grotesk, sans-serif' }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          Service Marketplace
        </motion.div>
        <motion.div
          className="absolute top-9 left-4 z-20 text-sm text-[#E8EAFF]/50 font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          6 x402-gated APIs · pay-per-call in USDC on Stellar
        </motion.div>
      </div>

      {/* Service cards grid */}
      <div className="px-6 pb-4 grid grid-cols-3 gap-3">
        {services.map((svc, i) => (
          <motion.div
            key={svc.name}
            className="bg-[#111827] border border-[#2d3748] rounded-lg p-3"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.15, duration: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className="flex items-start justify-between mb-1">
              <span className="text-white text-xs font-semibold leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                {svc.name}
              </span>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ color: catColors[svc.cat], background: `${catColors[svc.cat]}20` }}
              >
                {svc.cat}
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#E8EAFF]/40 mb-2">{svc.endpoint}</div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold font-mono" style={{ color: '#00D4AA' }}>{svc.price}</span>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] animate-pulse" />
                <span className="text-[10px] text-[#00D4AA] font-mono">LIVE</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
