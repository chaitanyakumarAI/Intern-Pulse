'use client';

import dynamic from 'next/dynamic';

// Client-only: the app reads its cached data from localStorage before the first paint.
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => (
    <div className="app">
      <div className="content" style={{ paddingTop: 'calc(var(--safe-top) + 80px)' }}>
        <div className="skeleton-list">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
