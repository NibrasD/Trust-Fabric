import { ScreenScene } from './ScreenScene';

export function WalkDashboard() {
  return (
    <ScreenScene
      image="/demo-video/screens/02_dashboard.jpg"
      page="/dashboard"
      caption="System Dashboard — live network stats & payment volume"
      subcaption="3 agents  ·  3.55 USDC across 24 transactions  ·  5.5/100 avg reputation"
      zoomFrom={{ x: 0, y: 0, scale: 1 }}
      zoomTo={{ x: 0, y: -2, scale: 1.15 }}
      highlights={[
        { x: 29, y: 30, label: '3 Agents', delay: 0.7, color: '#7B5FF5' },
        { x: 49, y: 30, label: '3.55 USDC', delay: 1.4, color: '#00D4AA' },
        { x: 68, y: 30, label: 'Reputation', delay: 2.1, color: '#FF6B35' },
        { x: 88, y: 30, label: 'Top Agent', delay: 2.8, color: '#7B5FF5' },
        { x: 60, y: 68, label: 'Payment Volume (30d)', delay: 4.0, color: '#00D4AA' },
      ]}
      cursor={[
        { x: 30, y: 35, delay: 600 },
        { x: 50, y: 35, delay: 1800 },
        { x: 68, y: 35, delay: 2800 },
        { x: 60, y: 65, delay: 4500 },
      ]}
    />
  );
}
