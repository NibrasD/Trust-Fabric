import { motion } from 'framer-motion';
import { ScreenScene } from './ScreenScene';

export function WalkMcp() {
  return (
    <motion.div className="w-full h-full relative"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}>
      <ScreenScene
        image="/demo-video/screens/10_mcp.jpg"
        page="/mcp"
        caption="MCP Server — connect Claude, Cursor, or any MCP agent to Trust Fabric"
        subcaption="10 tools available · payment-gated + free · Streamable HTTP transport"
        zoomFrom={{ x: 0, y: 0, scale: 1 }}
        zoomTo={{ x: 0, y: -3, scale: 1.12 }}
        highlights={[
          { x: 20, y: 25, label: 'MCP Endpoint', delay: 0.5, color: '#7B5FF5' },
          { x: 49, y: 25, label: 'MCP 2024-11-05', delay: 1.2, color: '#00D4AA' },
          { x: 76, y: 25, label: '10 tools', delay: 1.9, color: '#FF6B35' },
          { x: 24, y: 53, label: 'summarize_text · 0.10 USDC', delay: 3.0, color: '#7B5FF5' },
          { x: 24, y: 64, label: 'call_proxy · variable', delay: 3.8, color: '#7B5FF5' },
          { x: 24, y: 75, label: 'execute_workflow', delay: 4.5, color: '#7B5FF5' },
        ]}
        cursor={[
          { x: 20, y: 25, delay: 400 },
          { x: 49, y: 25, delay: 1500 },
          { x: 24, y: 53, delay: 2800 },
          { x: 24, y: 64, delay: 4000, click: true },
        ]}
      />

      {/* Workflows screenshot inset */}
      <motion.div
        className="absolute top-4 right-4 z-40 w-72 rounded-xl overflow-hidden border border-[#2d3748] shadow-2xl"
        initial={{ opacity: 0, scale: 0.85, x: 20 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        transition={{ delay: 5.5, duration: 0.5, type: 'spring' }}
      >
        <div className="bg-[#1a1f2e] px-3 py-1.5 text-[10px] font-mono text-[#E8EAFF]/60 border-b border-[#2d3748] flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#00D4AA]" />
          /workflows
        </div>
        <img src="/demo-video/screens/12_workflows.jpg" className="w-full" alt="" draggable={false} />
      </motion.div>
    </motion.div>
  );
}
