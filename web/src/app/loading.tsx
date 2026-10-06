export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-void)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '24px',
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Cosmic Pulse Rings */}
      <div style={{ position: 'relative', width: 64, height: 64 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid rgba(192, 132, 252, 0.4)',
            animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 8,
            borderRadius: '50%',
            border: '2px solid rgba(56, 189, 248, 0.6)',
            animation: 'spin 1.4s linear infinite',
            borderTopColor: 'transparent',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 20,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #c084fc, #38bdf8)',
            boxShadow: '0 0 20px rgba(192, 132, 252, 0.8)',
          }}
        />
      </div>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.74rem',
          letterSpacing: '0.12em',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
        }}
      >
        Synchronizing telemetry…
      </div>
    </div>
  );
}
