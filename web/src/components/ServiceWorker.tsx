'use client';

import { useEffect } from 'react';

/** Registers /sw.js (production only) so the app shell opens offline and loads instantly. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker registration failed:', err));
  }, []);
  return null;
}
