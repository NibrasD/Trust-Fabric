import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

const SCENE_DURATIONS = {
  title: 10000,
  problem: 12000,
  solution: 18000,
  stats: 25000,
  proof: 25000,
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#0a0e1a]">
      {/* Persistent global background mesh/particles */}
      <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-screen z-0">
        <motion.div 
          className="w-full h-full"
          animate={{
             backgroundPosition: ['0% 0%', '100% 100%']
          }}
          transition={{ duration: 60, ease: 'linear', repeat: Infinity }}
          style={{
             backgroundImage: 'radial-gradient(circle, #7B5FF5 1px, transparent 1px)',
             backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Global Vignette */}
      <div className="absolute inset-0 pointer-events-none z-50 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]" />

      {/* AnimatePresence for Scene transitions */}
      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="scene1" />}
        {currentScene === 1 && <Scene2 key="scene2" />}
        {currentScene === 2 && <Scene3 key="scene3" />}
        {currentScene === 3 && <Scene4 key="scene4" />}
        {currentScene === 4 && <Scene5 key="scene5" />}
      </AnimatePresence>
    </div>
  );
}
