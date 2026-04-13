import { motion } from 'framer-motion';
import { ScreenScene } from './ScreenScene';

export function WalkStellarLab() {
  return (
    <motion.div className="w-full h-full relative"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}>
      <ScreenScene
        image="/demo-video/screens/09_stellar_lab.jpg"
        page="/stellar"
        caption="Stellar Lab — live x402 payment challenge from the real API"
        subcaption="Shows exactly what an AI agent sees before paying — 402 response with MPP split details"
        zoomFrom={{ x: 0, y: 0, scale: 1 }}
        zoomTo={{ x: 0, y: -4, scale: 1.18 }}
        highlights={[
          { x: 22, y: 24, label: 'Stellar Testnet', delay: 0.5, color: '#00D4AA' },
          { x: 49, y: 24, label: 'USDC asset', delay: 1.2, color: '#7B5FF5' },
          { x: 76, y: 24, label: 'MPP 90/10 split', delay: 2.0, color: '#FF6B35' },
          { x: 35, y: 55, label: '402 Payment Required', delay: 3.0, color: '#FF6B35' },
          { x: 35, y: 63, label: '0.1 USDC required', delay: 3.8, color: '#00D4AA' },
        ]}
        cursor={[
          { x: 22, y: 24, delay: 400 },
          { x: 49, y: 24, delay: 1500 },
          { x: 76, y: 24, delay: 2500 },
          { x: 35, y: 55, delay: 3500 },
        ]}
      />

      {/* MPP split annotation */}
      <motion.div
        className="absolute top-1/3 right-6 z-40 bg-[#0a0e1a]/92 border border-[#FF6B35]/40 rounded-xl p-5 w-56"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 5.0, duration: 0.5 }}
      >
        <div className="text-[#FF6B35] text-[10px] font-mono uppercase tracking-widest mb-3">MPP Split Payment</div>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[#E8EAFF]/70 text-xs">Service Provider</span>
            <span className="text-[#00D4AA] font-mono font-bold">90%</span>
          </div>
          <div className="w-full h-2 bg-[#1a1f2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#00D4AA]"
              initial={{ width: 0 }}
              animate={{ width: '90%' }}
              transition={{ delay: 5.4, duration: 0.8 }}
            />
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[#E8EAFF]/70 text-xs">Protocol Fee</span>
            <span className="text-[#7B5FF5] font-mono font-bold">10%</span>
          </div>
          <div className="w-full h-2 bg-[#1a1f2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[#7B5FF5]"
              initial={{ width: 0 }}
              animate={{ width: '10%' }}
              transition={{ delay: 5.7, duration: 0.5 }}
            />
          </div>
          <div className="text-[#E8EAFF]/40 text-[10px] font-mono mt-1">1 Stellar tx · atomic</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
