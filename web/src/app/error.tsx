'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Application Error:', error);
  }, [error]);

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
          maxWidth: '520px',
          width: '100%',
          padding: '36px 32px',
          borderRadius: 20,
          textAlign: 'center',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(244, 63, 94, 0.15)',
          border: '1px solid rgba(244, 63, 94, 0.25)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 0 20px rgba(244, 63, 94, 0.25)',
          }}
        >
          <AlertTriangle size={28} style={{ color: '#fb7185' }} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.45rem',
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            marginBottom: 10,
          }}
        >
          System Glitch Detected
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.86rem',
            color: 'var(--text-muted)',
            lineHeight: 1.65,
            marginBottom: 24,
          }}
        >
          An unexpected interruption occurred while syncing your career telemetry. Your application records remain safely preserved in Notion.
        </p>

        {error.message && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: '#fda4af',
              marginBottom: 28,
              textAlign: 'left',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            className="btn-primary-pill"
            style={{
              padding: '10px 22px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <RefreshCw size={14} />
            <span>Re-synchronize View</span>
          </button>

          <Link
            href="/"
            className="btn-secondary-pill"
            style={{
              padding: '10px 20px',
              fontSize: '0.82rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Home size={14} />
            <span>Return to Dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
