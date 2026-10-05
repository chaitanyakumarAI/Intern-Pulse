import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'InternPulse | AI Job Tracker',
  description: 'Next-Gen AI Career Intelligence. Real-time safety analysis, interview prep sheets, and instant Gmail sync.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'InternPulse',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#06070d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: 'var(--bg-void)', overflowX: 'hidden' }}>
        {/* Top subtle cosmic glow line */}
        <div className="top-accent-line" />
        
        {/* Ambient cosmic lighting & starlight dot matrix */}
        <div className="cosmic-spotlight" />
        <div className="cosmic-spotlight-secondary" />
        <div className="bg-dot-matrix" />

        {children}
      </body>
    </html>
  );
}
