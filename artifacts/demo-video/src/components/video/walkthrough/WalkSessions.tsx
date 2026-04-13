import { ScreenScene } from './ScreenScene';

export function WalkSessions() {
  return (
    <ScreenScene
      image="/demo-video/screens/04_sessions.jpg"
      page="/sessions"
      caption="Session Manager — scoped agent payment sessions with spend limits"
      subcaption="Each session grants an agent access to specific endpoints with a USDC spend ceiling"
      zoomFrom={{ x: 0, y: 0, scale: 1 }}
      zoomTo={{ x: 0, y: -2, scale: 1.16 }}
      highlights={[
        { x: 30, y: 35, label: 'Demo Agent', delay: 0.6, color: '#7B5FF5' },
        { x: 29, y: 35, label: 'active', delay: 1.2, color: '#00D4AA' },
        { x: 40, y: 35, label: '5.00 USDC limit', delay: 2.0, color: '#FF6B35' },
        { x: 73, y: 35, label: '/api/services/*', delay: 2.8, color: '#7B5FF5' },
        { x: 92, y: 35, label: 'expires in 1h', delay: 3.5, color: '#00D4AA' },
        { x: 29, y: 56, label: 'expired', delay: 5.0, color: '#FF6B35' },
      ]}
      cursor={[
        { x: 30, y: 35, delay: 500 },
        { x: 40, y: 35, delay: 1800 },
        { x: 73, y: 35, delay: 3000 },
        { x: 30, y: 56, delay: 4800, click: true },
      ]}
    />
  );
}
