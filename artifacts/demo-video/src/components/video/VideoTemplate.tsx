import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { WalkIntro } from './walkthrough/WalkIntro';
import { WalkLanding } from './walkthrough/WalkLanding';
import { WalkDashboard } from './walkthrough/WalkDashboard';
import { WalkAgents } from './walkthrough/WalkAgents';
import { WalkSessions } from './walkthrough/WalkSessions';
import { WalkDemoLab } from './walkthrough/WalkDemoLab';
import { WalkStellarLab } from './walkthrough/WalkStellarLab';
import { WalkMarketplace } from './walkthrough/WalkMarketplace';
import { WalkMcp } from './walkthrough/WalkMcp';
import { WalkOutro } from './walkthrough/WalkOutro';

const SCENE_DURATIONS = {
  intro:       5000,
  landing:     9000,
  dashboard:   11000,
  agents:      9000,
  sessions:    11000,
  demolab:     13000,
  stellarlab:  13000,
  marketplace: 11000,
  mcp:         9000,
  outro:       8000,
};

const SCENES = [
  WalkIntro,
  WalkLanding,
  WalkDashboard,
  WalkAgents,
  WalkSessions,
  WalkDemoLab,
  WalkStellarLab,
  WalkMarketplace,
  WalkMcp,
  WalkOutro,
];

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });
  const ActiveScene = SCENES[currentScene] ?? WalkOutro;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e1a] font-sans">
      {/* Top browser bar — persistent */}
      <div className="absolute top-0 left-0 right-0 z-40 h-10 bg-[#1a1f2e] border-b border-[#2d3748] flex items-center px-4 gap-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 mx-4">
          <div className="max-w-md mx-auto h-6 bg-[#111827] rounded-md border border-[#2d3748] flex items-center px-3 gap-2">
            <svg className="w-3 h-3 text-[#4B5563]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[10px] text-[#6B7280] font-mono">trust-fabric.replit.app</span>
          </div>
        </div>
        <div className="w-20 h-5 bg-[#7B5FF5]/20 border border-[#7B5FF5]/40 rounded text-[9px] text-[#7B5FF5] font-mono flex items-center justify-center">
          LIVE DEMO
        </div>
      </div>

      {/* Scene area */}
      <div className="absolute inset-0 top-10">
        <AnimatePresence mode="wait">
          <ActiveScene key={currentScene} />
        </AnimatePresence>
      </div>
    </div>
  );
}
