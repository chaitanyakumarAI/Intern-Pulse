import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InternPulse | AI Job Tracker',
    short_name: 'InternPulse',
    description: 'Real-time AI-powered job application tracker with scam detection and interview cheat sheets.',
    start_url: '/',
    display: 'standalone',
    background_color: '#06070d',
    theme_color: '#06070d',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
