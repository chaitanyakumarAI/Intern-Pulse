import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="app">
      <div className="empty" style={{ minHeight: '80dvh', justifyContent: 'center' }}>
        <p className="empty-title">Page not found</p>
        <Link className="btn btn-primary" href="/">Back to InternPulse</Link>
      </div>
    </main>
  );
}
