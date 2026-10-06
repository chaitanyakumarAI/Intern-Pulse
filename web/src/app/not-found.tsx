import Link from 'next/link';
import { Home, Compass, Layers } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-void)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <div
        className="glass-card"
        style={{
          maxWidth: '540px',
          width: '100%',
          padding: '48px 36px',
          borderRadius: 24,
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 35px rgba(139, 92, 246, 0.2)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}
      >
        {/* Glowing 404 Accent */}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '5rem',
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.04em',
            background: 'linear-gradient(135deg, #c084fc 0%, #38bdf8 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 16,
            filter: 'drop-shadow(0 0 24px rgba(192, 132, 252, 0.4))',
          }}
        >
          404
        </div>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 14px',
            borderRadius: 9999,
            background: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            color: '#c084fc',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          <Compass size={12} />
          <span>COORDINATE OUT OF ORBIT</span>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.35rem',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            marginBottom: 12,
          }}
        >
          Page Not Found in Career Matrix
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.88rem',
            color: 'var(--text-muted)',
            lineHeight: 1.65,
            marginBottom: 32,
            maxWidth: '420px',
            margin: '0 auto 32px',
          }}
        >
          The requested route does not exist or has been shifted in your career navigation system. Return to your live telemetry feed.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/"
            className="btn-primary-pill"
            style={{
              padding: '10px 24px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Home size={14} />
            <span>Launch Dashboard</span>
          </Link>

          <Link
            href="/pipeline"
            className="btn-secondary-pill"
            style={{
              padding: '10px 22px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Layers size={14} />
            <span>View Kanban Board</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
