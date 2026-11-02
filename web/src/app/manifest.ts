import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'InternPulse',
    short_name: 'InternPulse',
    description: 'Your internship applications, tracked automatically from Gmail.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#07080f',
    theme_color: '#07080f',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
