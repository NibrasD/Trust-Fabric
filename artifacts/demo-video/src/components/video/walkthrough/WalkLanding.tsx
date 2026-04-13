import { ScreenScene } from './ScreenScene';

export function WalkLanding() {
  return (
    <ScreenScene
      image="/demo-video/screens/01_landing.jpg"
      page="/ home"
      caption="Landing Page — 'Agents with limits. On Stellar.'"
      subcaption="Trust Fabric is an agent-native x402 execution fabric for autonomous AI agents"
      zoomFrom={{ x: 0, y: 0, scale: 1 }}
      zoomTo={{ x: 0, y: 2, scale: 1.12 }}
      highlights={[
        { x: 50, y: 34, label: 'hero', delay: 0.8, color: '#7B5FF5' },
        { x: 43, y: 62, label: 'Register Agent', delay: 2.5, color: '#00D4AA' },
        { x: 58, y: 62, label: 'Explore APIs', delay: 3.2, color: '#00D4AA' },
      ]}
      cursor={[
        { x: 50, y: 50, delay: 500 },
        { x: 43, y: 62, delay: 2000, click: true },
        { x: 58, y: 62, delay: 4000, click: true },
      ]}
    />
  );
}
