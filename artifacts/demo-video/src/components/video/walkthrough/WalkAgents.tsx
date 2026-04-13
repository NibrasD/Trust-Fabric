import { ScreenScene } from './ScreenScene';

export function WalkAgents() {
  return (
    <ScreenScene
      image="/demo-video/screens/03_agents.jpg"
      page="/agents"
      caption="Agent Explorer — directory of all registered autonomous agents"
      subcaption="Demo Agent (8.95 rep)  ·  Sentinel Bot (5.14)  ·  Pathfinder Agent (2.29)"
      zoomFrom={{ x: 0, y: 0, scale: 1 }}
      zoomTo={{ x: 0, y: -3, scale: 1.14 }}
      highlights={[
        { x: 57, y: 44, label: 'reputation score', delay: 0.8, color: '#FF6B35' },
        { x: 78, y: 44, label: '1.02 USDC volume', delay: 1.8, color: '#00D4AA' },
        { x: 88, y: 44, label: '9 txs', delay: 2.5, color: '#7B5FF5' },
        { x: 57, y: 54, label: '5.14 rep', delay: 3.5, color: '#FF6B35' },
        { x: 57, y: 64, label: '2.29 rep', delay: 4.5, color: '#FF6B35' },
      ]}
      cursor={[
        { x: 50, y: 44, delay: 500 },
        { x: 78, y: 44, delay: 1600 },
        { x: 50, y: 54, delay: 3000 },
        { x: 50, y: 64, delay: 4200 },
      ]}
    />
  );
}
