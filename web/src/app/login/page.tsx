'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = params.get('next');
        router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
        router.refresh();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.message || 'Sign-in failed.');
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      style={{
        width: '100%', maxWidth: 360, padding: 28, display: 'flex', flexDirection: 'column', gap: 16,
        background: 'var(--bg-surface-elev)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-primary)' }}>InternPulse</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>Enter your dashboard password.</p>
      </div>
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-label="Dashboard password"
        style={{
          padding: '12px 14px', fontSize: 16, color: 'var(--text-primary)', background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', outline: 'none',
        }}
      />
      {error && <p role="alert" style={{ margin: 0, color: 'var(--accent-rose)', fontSize: 14 }}>{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        style={{
          padding: '12px 14px', fontSize: 16, fontWeight: 600, color: '#fff', border: 'none',
          borderRadius: 'var(--radius-sm)', background: 'var(--accent-primary)',
          opacity: busy || !password ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer',
        }}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, position: 'relative', zIndex: 1 }}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
