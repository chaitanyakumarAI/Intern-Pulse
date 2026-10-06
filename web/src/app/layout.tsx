import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://ai-internship-tracker.vercel.app'),
  title: {
    default: 'InternPulse | AI Job Tracker',
    template: '%s | InternPulse',
  },
  description: 'Next-Gen AI Career Intelligence. Real-time safety analysis, interview prep sheets, and instant Gmail sync.',
  keywords: ['AI Job Tracker', 'Internship Tracker', 'Career Pipeline', 'Gmail Job Tracker', 'Interview Prep', 'Job Scam Detector'],
  authors: [{ name: 'InternPulse' }],
  creator: 'InternPulse',
  openGraph: {
    title: 'InternPulse | Next-Gen AI Career Tracker',
    description: 'Real-time job tracking synchronized directly from your inbox with AI interview prep sheets and scam verification.',
    url: 'https://ai-internship-tracker.vercel.app',
    siteName: 'InternPulse',
    images: [
      {
        url: '/assets/brand-logo.jpg',
        width: 1200,
        height: 630,
        alt: 'InternPulse AI Career Intelligence',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InternPulse | Next-Gen AI Career Tracker',
    description: 'Real-time job tracking synchronized directly from your inbox with AI interview prep sheets and scam verification.',
    images: ['/assets/brand-logo.jpg'],
  },
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
