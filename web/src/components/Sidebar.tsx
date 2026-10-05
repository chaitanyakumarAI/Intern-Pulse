'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, Columns2, Lightbulb, RefreshCw, Zap, Sparkles } from 'lucide-react';

const NAV = [
  { icon: LayoutDashboard, label: 'Applications', shortLabel: 'APPS', href: '/', desc: 'Dashboard & pipeline' },
  { icon: Columns2, label: 'Job Board', shortLabel: 'BOARD', href: '/pipeline', desc: 'Kanban stage view' },
  { icon: Lightbulb, label: 'AI Insights', shortLabel: 'INSIGHTS', href: '/hub', desc: 'Safety radar & prep' },
];

interface SyncQuota {
  date: string;
  syncs_today: number;
  daily_limit: number;
  remaining: number;
  last_sync_time: string | null;
  resets_at: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [isScanning, setIsScanning] = useState(false);
  const isScanningRef = useRef(isScanning);
  useEffect(() => {
    isScanningRef.current = isScanning;
  }, [isScanning]);

  const [scanText, setScanText] = useState<string | null>(null);
  const [quota, setQuota] = useState<SyncQuota | null>(null);

  // Poll scan status & daily quota
  const checkStatus = async () => {
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        if (data.quota) {
          setQuota(data.quota);
        }
        if (data.is_running) {
          setIsScanning(true);
        } else if (isScanningRef.current) {
          setIsScanning(false);
          setScanText('Synced!');
          setTimeout(() => setScanText(null), 3500);
          window.dispatchEvent(new CustomEvent('internpulse-refresh'));
        }
      }
    } catch {}
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, isScanning ? 2500 : 10000);
    return () => clearInterval(interval);
  }, [isScanning]);

  const triggerScan = async () => {
    if (isScanning) return;
    if (quota && quota.remaining <= 0) {
      setScanText('Limit Reached');
      setTimeout(() => setScanText(null), 3500);
      return;
    }
    setIsScanning(true);
    setScanText('Syncing…');

    // Retrieve active time horizon window from client persistence
    let savedRange: string | undefined;
    try {
      const r = localStorage.getItem('internpulse_time_range');
      if (r && r !== 'ALL') savedRange = r;
    } catch {}

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: savedRange }),
      });
      const data = await res.json().catch(() => null);
      if (data?.quota) {
        setQuota(data.quota);
      }
      if (!res.ok) {
        setIsScanning(false);
        if (res.status === 429) {
          setScanText('Limit (5/5)');
        } else {
          setScanText('Failed');
        }
        setTimeout(() => setScanText(null), 3500);
      }
    } catch {
      setIsScanning(false);
      setScanText('Error');
      setTimeout(() => setScanText(null), 3000);
    }
  };

  return (
    <>
      {/* ── DESKTOP SIDEBAR ── */}
      <aside className="desktop-sidebar" style={{
        position: 'fixed', left: 0, top: 0, height: '100vh',
        width: 'var(--sidebar-w)', zIndex: 50,
        borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(9, 11, 24, 0.94)',
          backdropFilter: 'blur(36px)',
          WebkitBackdropFilter: 'blur(36px)',
        }} />

        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Brand Logo Header */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', flexShrink: 0 }}>
            <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <img
                src="/assets/brand-logo.jpg"
                alt="InternPulse Logo"
                style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  objectFit: 'cover',
                  border: '1px solid rgba(168, 85, 247, 0.45)',
                  boxShadow: '0 0 16px rgba(139, 92, 246, 0.35)',
                }}
              />
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.05rem',
                  letterSpacing: '-0.02em', color: '#ffffff', lineHeight: 1,
                  display: 'flex', alignItems: 'center', gap: 3
                }}>
                  <span>INTERN</span>
                  <span style={{
                    background: 'linear-gradient(135deg, #c084fc 0%, #818cf8 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>PULSE</span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.62rem',
                  color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.01em',
                  fontWeight: 500
                }}>
                  AI Career Intelligence
                </div>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: '0.62rem',
              fontWeight: 600, color: 'var(--text-dim)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '0 8px 6px',
            }}>
              WORKSPACE
            </div>

            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px',
                    borderRadius: 12,
                    background: active
                      ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.16) 0%, rgba(99, 102, 241, 0.08) 100%)'
                      : 'transparent',
                    border: active ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid transparent',
                    boxShadow: active ? '0 0 20px rgba(139, 92, 246, 0.15)' : 'none',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.04)';
                        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.borderColor = 'transparent';
                      }
                    }}
                  >
                    <item.icon
                      size={17}
                      style={{
                        color: active ? '#c084fc' : 'var(--text-dim)',
                        filter: active ? 'drop-shadow(0 0 8px rgba(192, 132, 252, 0.6))' : 'none',
                        flexShrink: 0,
                        transition: 'all 0.2s ease'
                      }}
                    />
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.82rem', fontWeight: active ? 700 : 600,
                        color: active ? '#ffffff' : 'var(--text-secondary)',
                        lineHeight: 1.2,
                        letterSpacing: '-0.01em',
                      }}>
                        {item.label}
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.62rem',
                        color: 'var(--text-dim)', marginTop: 2,
                      }}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Footer Quick Sync Pill Button & Daily Quota */}
          <div style={{
            padding: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            flexShrink: 0,
            background: 'rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 8, fontFamily: 'var(--font-body)', fontSize: '0.64rem',
              color: 'var(--text-dim)', fontWeight: 500,
            }}>
              <span>GMAIL ENGINE</span>
              {scanText ? (
                <span style={{ color: scanText.includes('Limit') ? '#fb7185' : '#38bdf8', fontWeight: 600 }}>{scanText}</span>
              ) : quota ? (
                <span style={{
                  color: quota.remaining === 0 ? '#fb7185' : quota.remaining <= 1 ? '#fbbf24' : '#34d399',
                  display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: quota.remaining === 0 ? '#fb7185' : '#34d399',
                    boxShadow: `0 0 6px ${quota.remaining === 0 ? '#fb7185' : '#34d399'}`
                  }} />
                  {quota.remaining}/{quota.daily_limit} Left Today
                </span>
              ) : (
                <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                  Active
                </span>
              )}
            </div>

            {/* Daily Quota Progress Segments */}
            {quota && (
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  display: 'flex', gap: 3, width: '100%', height: 4,
                  background: 'rgba(255, 255, 255, 0.06)', borderRadius: 2, overflow: 'hidden'
                }}>
                  {Array.from({ length: quota.daily_limit }).map((_, i) => {
                    const isUsed = i < quota.syncs_today;
                    return (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: '100%',
                          background: isUsed
                            ? (quota.remaining === 0 ? '#fb7185' : 'linear-gradient(90deg, #c084fc, #818cf8)')
                            : 'rgba(255, 255, 255, 0.1)',
                          transition: 'background 0.3s ease',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={triggerScan}
              disabled={isScanning || (quota?.remaining === 0)}
              className="btn-primary-pill"
              style={{
                width: '100%',
                padding: '9px 14px',
                fontSize: '0.74rem',
                justifyContent: 'space-between',
                opacity: quota?.remaining === 0 ? 0.6 : 1,
                cursor: quota?.remaining === 0 ? 'not-allowed' : isScanning ? 'wait' : 'pointer',
                border: quota?.remaining === 0 ? '1px solid rgba(251, 113, 133, 0.3)' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={13} style={{ animation: isScanning ? 'spin 1s linear infinite' : 'none' }} />
                <span>
                  {isScanning
                    ? 'Syncing...'
                    : quota?.remaining === 0
                    ? 'Daily Limit Reached'
                    : 'Sync Gmail'}
                </span>
              </div>
              <span style={{
                fontSize: '0.6rem', padding: '2px 8px', borderRadius: 9999,
                background: quota?.remaining === 0 ? 'rgba(251, 113, 133, 0.2)' : 'rgba(255, 255, 255, 0.15)',
                color: quota?.remaining === 0 ? '#fb7185' : '#ffffff',
                fontWeight: 600,
              }}>
                {quota ? `${quota.remaining}/${quota.daily_limit}` : 'NOW'}
              </span>
            </button>

            {quota?.remaining === 0 && (
              <div style={{
                marginTop: 6, fontSize: '0.6rem', color: 'var(--text-dim)',
                textAlign: 'center', fontFamily: 'var(--font-mono)'
              }}>
                Resets at 00:00 UTC
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── MOBILE TOP HEADER ── */}
      <header className="mobile-top-bar" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 56,
        zIndex: 100,
        background: 'rgba(6, 7, 13, 0.88)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
      }}>
        {/* Brand */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img
            src="/assets/brand-logo.jpg"
            alt="InternPulse Logo"
            style={{
              width: 30, height: 30, borderRadius: 8,
              objectFit: 'cover',
              border: '1px solid rgba(168, 85, 247, 0.4)',
              boxShadow: '0 0 12px rgba(139, 92, 246, 0.3)',
            }}
          />
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem',
            letterSpacing: '-0.02em', color: '#ffffff',
          }}>
            INTERN<span style={{
              background: 'linear-gradient(135deg, #c084fc 0%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>PULSE</span>
          </span>
        </Link>

        {/* Quick Sync Pill Button */}
        <button
          onClick={triggerScan}
          disabled={isScanning || (quota?.remaining === 0)}
          className="btn-primary-pill"
          style={{
            padding: '6px 14px',
            fontSize: '0.7rem',
            boxShadow: '0 0 16px rgba(139, 92, 246, 0.35)',
            opacity: quota?.remaining === 0 ? 0.6 : 1,
            cursor: quota?.remaining === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={11} style={{ animation: isScanning ? 'spin 1s linear infinite' : 'none' }} />
          <span>
            {isScanning
              ? 'SYNCING…'
              : quota?.remaining === 0
              ? 'LIMIT (0/5)'
              : quota
              ? `SYNC (${quota.remaining}/${quota.daily_limit})`
              : 'SYNC'}
          </span>
        </button>
      </header>

      {/* ── MOBILE BOTTOM NAVIGATION DOCK (Thumb-friendly Luxury Glass Pill) ── */}
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed', bottom: 10, left: 12, right: 12,
        zIndex: 100,
        background: 'rgba(10, 13, 28, 0.92)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(168, 85, 247, 0.25)',
        borderRadius: 24,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6), 0 0 25px rgba(139, 92, 246, 0.2)',
        padding: '8px 14px calc(8px + env(safe-area-inset-bottom, 0px)) 14px',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}>
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} style={{ flex: 1, maxWidth: 84, textAlign: 'center' }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 4px',
                borderRadius: 16,
                background: active ? 'rgba(139, 92, 246, 0.16)' : 'transparent',
                transition: 'all 0.2s ease',
              }}>
                <item.icon
                  size={19}
                  style={{
                    color: active ? '#c084fc' : 'var(--text-dim)',
                    filter: active ? 'drop-shadow(0 0 8px rgba(192, 132, 252, 0.7))' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.62rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? '#ffffff' : 'var(--text-dim)',
                  letterSpacing: '0.02em',
                }}>
                  {item.shortLabel}
                </span>
              </div>
            </Link>
          );
        })}

        {/* Quick Scan Action on Bottom Bar */}
        <button
          onClick={triggerScan}
          disabled={isScanning || (quota?.remaining === 0)}
          style={{
            flex: 1, maxWidth: 84,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '6px 4px',
            borderRadius: 16,
            background: 'transparent',
            cursor: (isScanning || quota?.remaining === 0) ? 'not-allowed' : 'pointer',
            opacity: quota?.remaining === 0 ? 0.5 : 1,
          }}
        >
          {isScanning ? (
            <RefreshCw
              size={18}
              style={{
                color: '#38bdf8',
                animation: 'spin 1s linear infinite',
              }}
            />
          ) : (
            <Zap
              size={19}
              style={{
                color: quota?.remaining === 0 ? '#94a3b8' : '#c084fc',
                fill: quota?.remaining === 0 ? 'none' : 'rgba(192, 132, 252, 0.3)',
                filter: quota?.remaining === 0 ? 'none' : 'drop-shadow(0 0 8px rgba(192, 132, 252, 0.8))',
                transition: 'all 0.2s ease',
              }}
            />
          )}
          <span style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.62rem',
            fontWeight: 700,
            color: isScanning ? '#38bdf8' : quota?.remaining === 0 ? '#fb7185' : '#c084fc',
            letterSpacing: '0.02em',
          }}>
            {isScanning ? 'SYNCING' : quota?.remaining === 0 ? 'LIMIT 0/5' : 'SCAN'}
          </span>
        </button>
      </nav>
    </>
  );
}
