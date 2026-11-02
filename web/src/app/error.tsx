'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app">
      <div className="empty" style={{ minHeight: '80dvh', justifyContent: 'center' }}>
        <p className="empty-title">Something went wrong</p>
        <p className="empty-detail">{error.message || 'An unexpected error occurred.'}</p>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
