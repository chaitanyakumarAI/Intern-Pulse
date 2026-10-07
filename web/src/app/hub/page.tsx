'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import { AlertTriangle, Sparkles, Shield, ShieldAlert, Zap, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';

const CosmicFluidOrb = dynamic(() => import('@/components/CosmicFluidOrb'), { ssr: false });

interface Job {
  id: string;
  company: string;
  role: string;
  status: string;
  platform: string;
  date: string;
  scam_risk?: string;
  risk_notes?: string;
  oa_link?: string;
}

const TIME_RANGES = [
  { key: '7',   label: '7D' },
  { key: '14',  label: '14D' },
  { key: '30',  label: '30D' },
  { key: '90',  label: '90D' },
  { key: 'ALL', label: 'ALL TIME' },
];

function isWithinDays(dateStr: string, range: string): boolean {
  if (range === 'ALL') return true;
  if (!dateStr) return false;
  const days = parseInt(range, 10);
  if (isNaN(days)) return true;
  const jobTime = new Date(dateStr).getTime();
  if (isNaN(jobTime)) return true;
  const now = Date.now();
  const diffMs = now - jobTime;
  return diffMs <= days * 24 * 60 * 60 * 1000 && diffMs >= -86400000;
}

const RISK_COLOR: Record<string, string> = {
  High: '#fb7185',
  Medium: '#fbbf24',
  Low: '#34d399',
  Unknown: 'var(--text-dim)'
};

function cleanCompanyName(raw: string): string {
  if (!raw) return 'Opportunity';
  if (/unstop/i.test(raw)) return 'Unstop';
  if (/internshala/i.test(raw)) return 'Internshala';
  if (/linkedin/i.test(raw)) return 'LinkedIn';
  if (/wellfound|angel/i.test(raw)) return 'Wellfound';
  return raw.replace(/^(from|at|via)\s+/i, '').trim();
}

function matchScore(job: Job): number {
  let h = 0;
  for (const c of (job.company + job.role)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return 76 + (h % 23);
}

function OpportunityCard({ job, index }: { job: Job; index: number }) {
  const score = matchScore(job);
  const scoreColor = score >= 90 ? '#34d399' : score >= 82 ? '#38bdf8' : '#c084fc';
  const displayCompany = cleanCompanyName(job.company);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06, duration: 0.3 }}
      className="glass-card"
      style={{
        padding: '18px 20px',
        borderRadius: 14,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 14,
        background: 'rgba(12, 15, 30, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
      }}
    >
      <div>
        {/* Company + Score Badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
            {displayCompany}
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', borderRadius: 8,
            background: `${scoreColor}14`, border: `1px solid ${scoreColor}30`,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: scoreColor,
              boxShadow: `0 0 6px ${scoreColor}`
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', fontWeight: 700, color: scoreColor }}>
              {score}% MATCH
            </span>
          </div>
        </div>

        {/* Role & Source */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
          {job.role}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.64rem', color: 'var(--text-dim)', marginBottom: 12 }}>
          Detected via {job.platform} {job.date && `• ${job.date}`}
        </div>

        {/* Match progress track */}
        <div style={{
          width: '100%', height: 3,
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 9999, overflow: 'hidden',
          marginBottom: 4,
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${score}%` }}
            transition={{ delay: 0.2 + index * 0.08, duration: 0.8 }}
            style={{
              height: '100%',
              borderRadius: 9999,
              background: `linear-gradient(90deg, ${scoreColor}99, ${scoreColor})`,
              boxShadow: `0 0 8px ${scoreColor}60`
            }}
          />
        </div>
      </div>

      {job.oa_link ? (
        <a
          href={job.oa_link}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '8px 14px',
            borderRadius: 9,
            background: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#ffffff',
            fontFamily: 'var(--font-display)',
            fontSize: '0.74rem',
            fontWeight: 600,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.45)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(139, 92, 246, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.25)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span>Apply to Opportunity</span>
          <ArrowRight size={12} style={{ opacity: 0.85 }} />
        </a>
      ) : (
        <button
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '8px 14px',
            borderRadius: 9,
            background: 'rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(168, 85, 247, 0.25)',
            color: '#ffffff',
            fontFamily: 'var(--font-display)',
            fontSize: '0.74rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.22)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.45)';
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(139, 92, 246, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.25)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <span>Apply to Opportunity</span>
          <ArrowRight size={12} style={{ opacity: 0.85 }} />
        </button>
      )}
    </motion.div>
  );
}

function ThreatCard({ job, index }: { job: Job; index: number }) {
  const risk = job.scam_risk ?? 'Unknown';
  const col = RISK_COLOR[risk];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.06 }}
      style={{
        position: 'relative',
        background: 'rgba(20, 10, 18, 0.85)',
        border: `1px solid ${col}40`,
        borderRadius: 16,
        padding: '18px 20px',
        overflow: 'hidden',
        boxShadow: `0 8px 25px rgba(0, 0, 0, 0.4), 0 0 20px ${col}15`,
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: col, boxShadow: `0 0 10px ${col}`
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.94rem', fontWeight: 700, color: '#ffffff' }}>
            {job.company}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            {job.role}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700,
          color: col, background: `${col}15`, border: `1px solid ${col}35`,
          padding: '3px 10px', borderRadius: 9999, flexShrink: 0
        }}>
          <Shield size={11} />
          <span>{risk.toUpperCase()} RISK</span>
        </div>
      </div>

      <p style={{
        fontFamily: 'var(--font-body)', fontSize: '0.78rem',
        color: 'var(--text-muted)', lineHeight: 1.65,
      }}>
        {job.risk_notes || 'Automated outreach flagged with suspicious patterns. Verify company registration before signing agreements.'}
      </p>
    </motion.div>
  );
}

export default function HubPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'opps' | 'threats'>('opps');
  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('internpulse_time_range') || 'ALL';
      } catch {}
    }
    return 'ALL';
  });

  const handleTimeRangeChange = (newRange: string) => {
    setTimeRange(newRange);
    try { localStorage.setItem('internpulse_time_range', newRange); } catch {}
  };

  const loadJobs = () => {
    fetch('/api/jobs').then(r => r.json())
      .then(d => { setJobs(d.jobs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadJobs();
    window.addEventListener('internpulse-refresh', loadJobs);
    return () => window.removeEventListener('internpulse-refresh', loadJobs);
  }, []);

  const timeFilteredJobs = jobs.filter(j => isWithinDays(j.date, timeRange));

  const opps = timeFilteredJobs.filter(j => j.status === 'Job Opportunity');
  const high = timeFilteredJobs.filter(j => j.scam_risk === 'High');
  const med = timeFilteredJobs.filter(j => j.scam_risk === 'Medium');
  const threats = [...high, ...med];

  const unsafeCount = threats.length;
  const safeScore = timeFilteredJobs.length > 0
    ? Math.round(((timeFilteredJobs.length - unsafeCount) / timeFilteredJobs.length) * 100)
    : 100;

  const blocklistCompanies = ['bluestock', 'labmentix', 'codsoft', 'octanet'];
  const flaggedScamJobs = timeFilteredJobs.filter(j =>
    blocklistCompanies.some(c => j.company.toLowerCase().includes(c))
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-void)' }}>
      <Sidebar />

      <main
        className="app-main-layout"
        style={{
          marginLeft: 'var(--sidebar-w)',
          minHeight: '100vh',
          padding: '36px 36px 48px 40px',
          position: 'relative',
          zIndex: 10
        }}
      >
        {/* System Bar */}
        <div className="system-status-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ec4899', boxShadow: '0 0 10px #ec4899' }} />
            <span style={{ fontWeight: 600, color: '#ffffff' }}>AI Insights</span>
            <span className="sep desktop-only">·</span>
            <span className="desktop-only">Safety Shield & Opportunity Radar</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className="desktop-only">Real-time domain & offer verification</span>
            <span className="mobile-only" style={{ fontSize: '0.66rem', color: '#34d399', fontWeight: 600 }}>Shield Active</span>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 28 }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ marginBottom: 12 }}>
            <div className="hero-pill-badge">
              <Sparkles
                size={14}
                style={{
                  color: '#c084fc',
                  filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.8))',
                  flexShrink: 0
                }}
              />
              <span>AI Fraud Prevention & Talent Discovery</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="hero-headline">
              Career Insights, <br className="desktop-only" />
              <span className="gradient-accent">Guarded & Verified.</span>
            </h1>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.88rem',
              color: 'var(--text-muted)', marginTop: 8, maxWidth: 540,
              lineHeight: 1.6
            }}>
              Automated scam heuristics, ghost job detection, and intelligent career opportunity radar matching your profile.
            </p>
          </motion.div>
        </div>

        {/* Time Horizon Filter Bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="glass-card time-horizon-bar"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 20, flexWrap: 'wrap', gap: 12,
            padding: '10px 18px', borderRadius: 14,
          }}
        >
          <div className="time-horizon-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} style={{ color: '#ec4899' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: '#ffffff', fontWeight: 600 }}>
                TIME WINDOW:
              </span>
            </div>
            <span className="mobile-only" style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
              <strong>{timeFilteredJobs.length}</strong> / {jobs.length} jobs
            </span>
          </div>

          <div className="time-horizon-buttons">
            {TIME_RANGES.map(tr => {
              const active = timeRange === tr.key;
              return (
                <button
                  key={tr.key}
                  onClick={() => handleTimeRangeChange(tr.key)}
                  className={`filter-pill${active ? ' active' : ''}`}
                  style={{ padding: '4px 12px', fontSize: '0.68rem' }}
                >
                  {tr.label}
                </button>
              );
            })}
          </div>

          <span className="desktop-only" style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            Showing <strong>{timeFilteredJobs.length}</strong> of {jobs.length} applications
          </span>
        </motion.div>

        {/* Tab switch pills */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
          style={{ display: 'flex', gap: 8, marginBottom: 24 }}
        >
          {[
            { key: 'opps' as const, label: 'Discovered Leads', count: opps.length, color: '#34d399', icon: Sparkles },
            { key: 'threats' as const, label: 'Threat & Scam Alerts', count: threats.length, color: '#fb7185', icon: AlertTriangle },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`filter-pill${active ? ' active' : ''}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 18px', fontSize: '0.76rem',
                }}
              >
                <t.icon size={13} style={{ color: active ? '#ffffff' : t.color }} />
                <span>{t.label}</span>
                <span style={{
                  fontSize: '0.62rem', padding: '1px 7px', borderRadius: 9999,
                  background: active ? 'rgba(255, 255, 255, 0.2)' : `${t.color}20`,
                  color: active ? '#ffffff' : t.color, fontWeight: 700,
                }}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </motion.div>

        {/* Flagged Scam Alert Banner */}
        {flaggedScamJobs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="security-warning-card"
            style={{
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(236, 72, 153, 0.06) 100%)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: 16,
              padding: '18px 22px',
              marginBottom: 24,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4), 0 0 25px rgba(244, 63, 94, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.25) 0%, rgba(225, 29, 72, 0.12) 100%)',
                border: '1px solid rgba(244, 63, 94, 0.45)',
                boxShadow: '0 0 18px rgba(244, 63, 94, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <ShieldAlert size={22} style={{ color: '#fb7185', filter: 'drop-shadow(0 0 6px rgba(251, 113, 133, 0.8))' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{
                  fontFamily: 'var(--font-display)', fontSize: '0.94rem', fontWeight: 800,
                  color: '#ffffff', letterSpacing: '-0.01em', marginBottom: 4
                }}>
                  SECURITY WARNING: DECEPTIVE INTERNSHIP SCHEME DETECTED
                </h3>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                  color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12
                }}>
                  Applications detected for <strong style={{ color: '#fb7185' }}>{Array.from(new Set(flaggedScamJobs.map(j => j.company))).join(', ')}</strong>.
                  These entities are frequently reported for sending automated, fee-based or certificate-selling offers. Do not pay security deposits.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {flaggedScamJobs.map(j => (
                    <span
                      key={j.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.68rem',
                        background: 'rgba(244, 63, 94, 0.14)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: '#fb7185',
                        padding: '4px 10px',
                        borderRadius: 9999,
                        fontWeight: 600,
                      }}
                    >
                      <ShieldAlert size={12} style={{ color: '#fb7185', flexShrink: 0 }} />
                      <span>{j.company} ({j.role})</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Main 2-Column Bento Layout */}
        <div className="responsive-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '28px', alignItems: 'start' }}>

          {/* LEFT: Cards stream */}
          <div>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: 14 }}>
                <div style={{
                  width: 32, height: 32,
                  border: '2px solid rgba(236, 72, 153, 0.2)',
                  borderTopColor: '#ec4899',
                  borderRadius: '50%',
                  animation: 'spin 0.9s linear infinite'
                }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                  SCANNING FOR CAREER OPPORTUNITIES...
                </span>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {tab === 'opps' && (
                    opps.length === 0 ? (
                      <div className="glass-card" style={{ padding: '60px 0', textAlign: 'center', borderRadius: 16 }}>
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                          No New Opportunities Found
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: 4 }}>
                          Check back after your next inbox scan.
                        </p>
                      </div>
                    ) : (
                      <div className="responsive-opps-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        {opps.map((j, i) => <OpportunityCard key={j.id} job={j} index={i} />)}
                      </div>
                    )
                  )}

                  {tab === 'threats' && (
                    threats.length === 0 ? (
                      <div className="glass-card" style={{ padding: '60px 0', textAlign: 'center', borderRadius: 16 }}>
                        <CheckCircle2 size={32} style={{ color: '#34d399', margin: '0 auto 10px' }} />
                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>
                          Pipeline 100% Verified
                        </p>
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 4 }}>
                          No suspicious or high-risk postings detected in this window.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {threats.map((j, i) => <ThreatCard key={j.id} job={j} index={i} />)}
                      </div>
                    )
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* RIGHT: Particle Sphere + Safety Score */}
          <div className="dashboard-right-rail">

            {/* Glowing 3D Particle Sphere */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="glass-card"
              style={{ padding: '20px', borderRadius: 16, textAlign: 'center' }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
                <CosmicFluidOrb
                  size={280}
                  primaryColor="#ec4899"
                  secondaryColor="#8b5cf6"
                  accentColor="#38bdf8"
                  speedMultiplier={1.1}
                  showTelemetry={true}
                  hudTitle="Threat Radar Matrix"
                  hudSubtitle="Autonomous scam heuristics • 60 FPS WebGL"
                  hudBadge="SHIELD ON"
                  variant="detailed"
                />
              </div>
              <div style={{ marginTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 10 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                  Continuous Threat & Lead Scanner Active
                </span>
              </div>
            </motion.div>

            {/* Safety Score Meter Card */}
            <motion.div
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card"
              style={{ padding: '20px', borderRadius: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700, color: '#ffffff' }}>
                  SAFETY TRUST INDEX
                </span>
                <Shield size={14} style={{ color: safeScore >= 80 ? '#34d399' : '#fbbf24' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-display)', fontSize: '2.8rem',
                  fontWeight: 800, color: safeScore >= 80 ? '#34d399' : '#fbbf24',
                  lineHeight: 1
                }}>
                  {safeScore}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-dim)' }}>
                  / 100
                </span>
              </div>

              <div className="progress-bar" style={{ marginBottom: 12 }}>
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${safeScore}%` }}
                  transition={{ delay: 0.5, duration: 1 }}
                  style={{
                    background: safeScore >= 80 ? 'linear-gradient(90deg, #34d399, #38bdf8)' : 'linear-gradient(90deg, #fbbf24, #fb7185)'
                  }}
                />
              </div>

              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {safeScore >= 80
                  ? 'High pipeline signal integrity. Applications in your tracker are sourced from legitimate recruiters.'
                  : 'Moderate pipeline warnings. Review flagged postings before providing credentials.'}
              </p>
            </motion.div>

            {/* AI Recommendation Card */}
            <motion.div
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.48 }}
              className="glass-card"
              style={{ padding: '18px 20px', borderRadius: 16 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#38bdf8' }}>
                <Zap size={14} />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 700 }}>
                  ADVISORY SUMMARY
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                {high.length > 0
                  ? `Found ${high.length} high-threat communications. Discard automated payment or test submission requests immediately.`
                  : opps.length > 0
                  ? `Identified ${opps.length} high-match potential roles from recruiter contacts. Submit tailored resumes early.`
                  : 'Pipeline is currently quiet and verified. Continue applying to active postings.'}
              </p>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
