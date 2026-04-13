import { motion } from 'framer-motion';
import { ScreenScene } from './ScreenScene';

export function WalkDemoLab() {
  return (
    <motion.div
      className="w-full h-full relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <ScreenScene
        image="/demo-video/screens/08_demo_lab.jpg"
        page="/demo"
        caption="Demo Lab — simulate an AI agent purchasing an API via x402"
        subcaption="Agent hits 402 → creates session → pays USDC → executes call — all automated"
        zoomFrom={{ x: 0, y: 0, scale: 1 }}
        zoomTo={{ x: 0, y: -3, scale: 1.1 }}
        highlights={[
          { x: 38, y: 44, label: 'Agent Buyer', delay: 0.6, color: '#7B5FF5' },
          { x: 38, y: 57, label: 'Service (Seller)', delay: 1.5, color: '#00D4AA' },
          { x: 38, y: 86, label: 'Run Agent', delay: 3.0, color: '#FF6B35' },
        ]}
        cursor={[
          { x: 38, y: 44, delay: 400, click: true },
          { x: 38, y: 57, delay: 1800, click: true },
          { x: 38, y: 86, delay: 3500, click: true },
        ]}
      />

      {/* x402 flow overlay — bottom-left annotation */}
      <motion.div
        className="absolute bottom-20 left-6 z-40 bg-[#0a0e1a]/90 border border-[#2d3748] rounded-lg p-4 font-mono text-xs max-w-xs"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 4.5, duration: 0.5 }}
      >
        <div className="text-[#7B5FF5] mb-2 text-[10px] uppercase tracking-widest">x402 Flow</div>
        {[
          { step: 'GET /api/services/...', color: '#E8EAFF', delay: 4.7 },
          { step: '← 402 Payment Required', color: '#FF6B35', delay: 5.2 },
          { step: 'Agent signs Stellar tx', color: '#E8EAFF', delay: 5.7 },
          { step: 'POST + X-PAYMENT: A1B2...', color: '#7B5FF5', delay: 6.2 },
          { step: '← 200 OK ✓', color: '#00D4AA', delay: 6.7 },
        ].map((line) => (
          <motion.div
            key={line.step}
            className="py-0.5"
            style={{ color: line.color }}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: line.delay, duration: 0.3 }}
          >
            {line.step}
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
