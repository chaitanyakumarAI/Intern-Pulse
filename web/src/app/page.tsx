'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import ActivityChart from '@/components/ActivityChart';
import {
  RefreshCw,
  ChevronDown,
  Shield,
  Calendar,
  MapPin,
  Sparkles,
  Zap,
  ExternalLink,
  Layers,
  ArrowRight,
  TrendingUp,
  Award,
  AlertTriangle
} from 'lucide-react';

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
  prep_sheet?: string;
  oa_link?: string;
}

const STATUS_CFG: Record<string, { cls: string; label: string; dot: string }> = {
  'Applied':             { cls: 'badge-applied',     label: 'APPLIED',      dot: '#cbd5e1' },
  'Under Review':        { cls: 'badge-review',      label: 'REVIEWING',    dot: '#c084fc' },
  'OA Sent':             { cls: 'badge-oa',          label: 'OA SENT',      dot: '#fbbf24' },
  'Interview Scheduled': { cls: 'badge-interview',   label: 'INTERVIEW',    dot: '#38bdf8' },
  'Offer':               { cls: 'badge-offer',        label: 'OFFER',        dot: '#34d399' },
  'Rejected':            { cls: 'badge-rejected',     label: 'REJECTED',     dot: '#fb7185' },
  'Job Opportunity':     { cls: 'badge-opportunity',  label: 'NEW LEAD',     dot: '#f472b6' },
};

const AVATAR_COLORS = [
  ['#c084fc', '#24103c'],
  ['#38bdf8', '#0b263b'],
  ['#34d399', '#082b20'],
  ['#fbbf24', '#362306'],
  ['#f472b6', '#3b0d24'],
  ['#818cf8', '#161942'],
  ['#fb7185', '#380c14'],
];

function getInitials(name: string) {
  return name.replace(/[^a-zA-Z\s]/g, '').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function getAvatarColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

const ALL_FILTERS = ['ALL', 'Applied', 'Under Review', 'OA Sent', 'Interview Scheduled', 'Offer', 'Rejected', 'Job Opportunity'];

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

const FILTER_LABELS: Record<string, string> = {
  'ALL': 'ALL APPLICATIONS',
  'Applied': 'APPLIED',
  'Under Review': 'REVIEWING',
  'OA Sent': 'OA SENT',
  'Interview Scheduled': 'INTERVIEWS',
  'Offer': 'OFFERS',
  'Rejected': 'REJECTED',
  'Job Opportunity': 'NEW LEADS',
};

function JobRow({ job, index }: { job: Job; index: number }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CFG[job.status] ?? STATUS_CFG['Applied'];
  const [fg, bg] = getAvatarColor(job.company);
  const initials = getInitials(job.company);
  const riskColor = job.scam_risk === 'High' ? '#fb7185' : job.scam_risk === 'Medium' ? '#fbbf24' : '#34d399';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="job-row" onClick={() => setOpen(!open)}>
        {/* Company Avatar with subtle gradient border */}
        <div className="company-avatar" style={{
          background: bg,
          color: fg,
          border: `1px solid ${fg}40`,
          boxShadow: `0 4px 14px ${fg}15`,
        }}>
          {initials}
        </div>

        {/* Company & Role details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--font-display)', fontSize: '0.86rem',
            fontWeight: 700, color: '#ffffff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            <span>{job.company}</span>
            {job.date && (
              <span className="desktop-only" style={{
                fontFamily: 'var(--font-body)', fontSize: '0.64rem',
                color: 'var(--text-dim)', fontWeight: 400
              }}>
                • {job.date}
              </span>
            )}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)', fontSize: '0.78rem',
            color: 'var(--text-muted)', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {job.role}
          </div>
          <div className="mobile-only" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
              via {job.platform}
            </span>
            {job.date && (
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                • {job.date}
              </span>
            )}
          </div>
        </div>

        {/* Platform tag (desktop) */}
        <div className="desktop-only" style={{
          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '4px 10px', borderRadius: 9999,
        }}>
          <MapPin size={10} style={{ color: 'var(--text-dim)' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
            {job.platform}
          </span>
        </div>

        {/* Scam Risk Indicator */}
        {job.scam_risk && job.scam_risk !== 'Unknown' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            padding: '3px 8px', borderRadius: 9999,
            background: `${riskColor}12`, border: `1px solid ${riskColor}30`,
          }}>
            <Shield size={11} style={{ color: riskColor }} />
            <span className="desktop-only" style={{ fontFamily: 'var(--font-body)', fontSize: '0.64rem', fontWeight: 600, color: riskColor }}>
              {job.scam_risk}
            </span>
          </div>
        )}

        {/* Status Pill Badge */}
        <span className={`badge ${cfg.cls}`} style={{ flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
          {cfg.label}
        </span>

        {/* Chevron */}
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ flexShrink: 0 }}>
          <ChevronDown size={14} style={{ color: 'var(--text-dim)' }} />
        </motion.div>
      </div>

      {/* Expanded Accordion Drawer (Cerebral AI Style) */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden', background: 'rgba(8, 10, 22, 0.5)', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
          >
            <div className="job-details-container" style={{ padding: '16px 20px 18px 78px' }}>
              <div className="job-details-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 20 }}>
                {/* Risk Analysis Card */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-display)', fontSize: '0.72rem',
                    fontWeight: 700, color: '#fbbf24', letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}>
                    <Shield size={12} />
                    <span>AI RISK & SECURITY ANALYSIS</span>
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.78rem',
                    color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    {job.risk_notes || 'Verified legitimate sender domain. No suspicious requests for banking details or upfront fee payment identified.'}
                  </p>
                </div>

                {/* Interview Preparation Sheet Card */}
                <div style={{
                  background: 'rgba(139, 92, 246, 0.04)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: 12, padding: '14px 16px',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-display)', fontSize: '0.72rem',
                    fontWeight: 700, color: '#c084fc', letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}>
                    <Sparkles size={12} />
                    <span>AI INTERVIEW PREP SHEET</span>
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: '0.78rem',
                    color: 'var(--text-secondary)', lineHeight: 1.65,
                    whiteSpace: 'pre-line'
                  }}>
                    {job.prep_sheet || `Key focus: Review requirements for ${job.role} at ${job.company}. Prepare stories demonstrating relevant technical impact and project lifecycle leadership.`}
                  </p>
                </div>
              </div>

              {job.oa_link && (
                <div style={{ marginTop: 12 }}>
                  <a
                    href={job.oa_link}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary-pill"
                    style={{
                      padding: '7px 16px', fontSize: '0.72rem', display: 'inline-flex', gap: 6,
                    }}
                  >
                    <span>Launch Assessment Portal</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function buildActivityData(jobs: Job[]) {
  const counts: Record<string, number> = {};
  jobs.forEach(j => {
    if (!j.date) return;
    const w = j.date.substring(0, 7);
    counts[w] = (counts[w] ?? 0) + 1;
  });
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([label, value]) => ({ label, value }));
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMock, setIsMock] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [timeRange, setTimeRange] = useState<string>('ALL');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('internpulse_time_range');
      if (saved) setTimeRange(saved);
    } catch {}
  }, []);

  const handleTimeRangeChange = (newRange: string) => {
    setTimeRange(newRange);
    try { localStorage.setItem('internpulse_time_range', newRange); } catch {}
  };

  // Pipeline Scan State & Daily Quota
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [quota, setQuota] = useState<{
    date: string;
    syncs_today: number;
    daily_limit: number;
    remaining: number;
    last_sync_time: string | null;
    resets_at: string;
  } | null>(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const d = await fetch('/api/jobs').then(r => r.json());
      setJobs(d.jobs ?? []);
      setIsMock(d.isMock ?? false);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const checkScanStatus = async () => {
    try {
      const res = await fetch('/api/scan');
      if (res.ok) {
        const data = await res.json();
        setScanStatus(data);
        if (data.quota) {
          setQuota(data.quota);
        }
        if (data.is_running) {
          setIsScanning(true);
        } else if (isScanning) {
          setIsScanning(false);
          const p = data.stats?.processed ?? 0;
          const c = data.stats?.created ?? 0;
          setScanMessage(`Sync complete! ${p} emails checked (${c} new records added).`);
          setTimeout(() => setScanMessage(null), 6000);
          fetchJobs();
        }
      }
    } catch (e) {
      console.error('Failed to check scan status:', e);
    }
  };

  useEffect(() => {
    fetchJobs();
    checkScanStatus();
    const handleRefresh = () => fetchJobs();
    window.addEventListener('internpulse-refresh', handleRefresh);
    return () => window.removeEventListener('internpulse-refresh', handleRefresh);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isScanning) {
      interval = setInterval(checkScanStatus, 2500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScanning]);

  const triggerScan = async () => {
    if (quota && quota.remaining <= 0) {
      setScanMessage(`Daily limit reached (${quota.daily_limit}/${quota.daily_limit}). Sync quota resets at 00:00 UTC.`);
      return;
    }
    setIsScanning(true);
    setScanMessage(timeRange !== 'ALL' ? `Scanning last ${timeRange} days…` : 'Initiating full inbox scan…');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: timeRange !== 'ALL' ? timeRange : undefined }),
      });
      const data = await res.json().catch(() => null);
      if (data?.quota) {
        setQuota(data.quota);
      }
      if (!res.ok) {
        if (res.status === 429) {
          setScanMessage(data?.message || `Daily quota reached (${quota?.daily_limit || 5}/${quota?.daily_limit || 5}). Resets at 00:00 UTC.`);
        } else {
          setScanMessage(data?.message || 'Scan request failed.');
        }
        setIsScanning(false);
      } else {
        setScanMessage('AI engine scanning Gmail… updates stream live in seconds.');
      }
    } catch {
      setScanMessage('Failed to contact scan service.');
      setIsScanning(false);
    }
  };

  // Filter jobs by selected time horizon
  const timeFilteredJobs = jobs.filter(j => isWithinDays(j.date, timeRange));

  const tracked = timeFilteredJobs.filter(j => j.status !== 'Job Opportunity');
  const offers = timeFilteredJobs.filter(j => j.status === 'Offer').length;
  const interviews = timeFilteredJobs.filter(j => j.status === 'Interview Scheduled').length;
  const responseRate = tracked.length > 0
    ? Math.round(((tracked.length - timeFilteredJobs.filter(j => j.status === 'Applied').length) / tracked.length) * 100)
    : 0;
  const opps = timeFilteredJobs.filter(j => j.status === 'Job Opportunity');
  const highRisk = timeFilteredJobs.filter(j => j.scam_risk === 'High').length;
  const filtered = filter === 'ALL' ? timeFilteredJobs : timeFilteredJobs.filter(j => j.status === filter);
  const actData = buildActivityData(timeFilteredJobs);
  const now = new Date().toISOString().split('T')[0].replace(/-/g, '.');

  const STATS = [
    { label: 'Active Pipeline', value: tracked.length, sub: 'tracked roles', color: '#c084fc', icon: Layers },
    { label: 'Interviews Scheduled', value: interviews, sub: 'upcoming rounds', color: '#38bdf8', icon: TrendingUp },
    { label: 'Offers Received', value: offers, sub: 'final offers', color: '#34d399', icon: Award },
    { label: 'Response Velocity', value: `${responseRate}%`, sub: 'interview/OA rate', color: '#818cf8', icon: Sparkles },
  ];

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
        {/* ── System Status & Live Sync Pill ── */}
        <div className="system-status-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isScanning ? '#38bdf8' : '#34d399',
              boxShadow: `0 0 10px ${isScanning ? '#38bdf8' : '#34d399'}`,
              animation: 'pulse 2.5s infinite',
            }} />
            <span style={{ fontWeight: 600, color: '#ffffff' }}>InternPulse Engine</span>
            <span className="sep desktop-only">·</span>
            <span className="desktop-only">{now}</span>
          </div>

          {quota && (
            <>
              <span className="sep desktop-only">·</span>
              <span className="desktop-only" style={{
                color: quota.remaining === 0 ? '#fb7185' : quota.remaining <= 1 ? '#fbbf24' : '#c084fc',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: quota.remaining === 0 ? '#fb7185' : '#34d399',
                  boxShadow: `0 0 6px ${quota.remaining === 0 ? '#fb7185' : '#34d399'}`
                }} />
                Daily Sync: {quota.remaining}/{quota.daily_limit} left
              </span>
            </>
          )}

          {isMock && (
            <>
              <span className="sep desktop-only">·</span>
              <span style={{ color: '#38bdf8' }} className="desktop-only">DEMO DATA MODE</span>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
            <span>Status: <strong style={{ color: isScanning ? '#38bdf8' : '#34d399' }}>{isScanning ? 'Syncing...' : 'Online'}</strong></span>
            <span className="desktop-only">Total Ingested: <strong style={{ color: '#ffffff' }}>{jobs.length}</strong></span>
          </div>
        </div>

        {/* ── Hero Section (Craftify Reference) ── */}
        <div style={{ marginBottom: 36 }}>
          {/* Floating Pill Announcement Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ marginBottom: 14 }}
          >
            <div className="hero-pill-badge">
              <Sparkles
                size={14}
                style={{
                  color: '#c084fc',
                  filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.8))',
                  flexShrink: 0
                }}
              />
              <span>Next-Gen AI Career Tracker • Gmail Live Pipeline</span>
            </div>
          </motion.div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <h1 className="hero-headline">
                Your Career Applications, <br className="desktop-only" />
                <span className="gradient-accent">Elevated by Intelligence.</span>
              </h1>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '0.92rem',
                color: 'var(--text-muted)', marginTop: 10, maxWidth: 580,
                lineHeight: 1.6
              }}>
                Real-time tracking synchronized directly from your inbox. Automatic interview prep sheets, scam verification, and velocity analytics.
              </p>
            </motion.div>

            {/* CTAs: Scan button + Insights link + Daily Quota */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
              className="hero-cta-group"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link href="/hub" className="btn-secondary-pill desktop-only">
                  <Shield size={13} style={{ color: '#c084fc' }} />
                  <span>AI Safety Hub</span>
                </Link>

                <button
                  onClick={triggerScan}
                  disabled={isScanning || quota?.remaining === 0}
                  className="btn-primary-pill"
                  style={{
                    opacity: quota?.remaining === 0 ? 0.6 : 1,
                    cursor: quota?.remaining === 0 ? 'not-allowed' : isScanning ? 'wait' : 'pointer',
                    border: quota?.remaining === 0 ? '1px solid rgba(251, 113, 133, 0.4)' : undefined,
                  }}
                >
                  {isScanning ? (
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : (
                    <Zap
                      size={14}
                      style={{
                        color: '#ffffff',
                        fill: 'currentColor',
                        filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.6))',
                        flexShrink: 0
                      }}
                    />
                  )}
                  <span>
                    {isScanning
                      ? 'SYNCING GMAIL...'
                      : quota?.remaining === 0
                      ? 'DAILY LIMIT REACHED (5/5)'
                      : 'SCAN INBOX NOW'}
                  </span>
                </button>

                {quota && (
                  <div
                    className="desktop-only"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      borderRadius: 9999,
                      background: quota.remaining === 0 ? 'rgba(251, 113, 133, 0.08)' : 'rgba(139, 92, 246, 0.08)',
                      border: `1px solid ${quota.remaining === 0 ? 'rgba(251, 113, 133, 0.25)' : 'rgba(168, 85, 247, 0.25)'}`,
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.66rem',
                      fontWeight: 600,
                      color: quota.remaining === 0 ? '#fb7185' : '#c084fc',
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: quota.remaining === 0 ? '#fb7185' : '#34d399',
                      boxShadow: `0 0 6px ${quota.remaining === 0 ? '#fb7185' : '#34d399'}`
                    }} />
                    <span>{quota.remaining}/{quota.daily_limit} Daily</span>
                  </div>
                )}
              </div>

              {scanMessage && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.68rem',
                  color: scanMessage.includes('limit') || scanMessage.includes('failed') ? '#fb7185' : '#38bdf8',
                  fontWeight: 500
                }}>
                  {scanMessage}
                </span>
              )}
              {!scanMessage && quota?.remaining === 0 && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: '#fb7185' }}>
                  Daily limit of {quota.daily_limit} syncs exhausted. Resets automatically at 00:00 UTC.
                </span>
              )}
              {!scanMessage && quota?.remaining !== 0 && scanStatus?.last_run_time && (
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.64rem', color: 'var(--text-dim)' }}>
                  Last synced: {new Date(scanStatus.last_run_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {scanStatus.stats?.processed ?? 0} emails scanned • {quota?.remaining ?? 5} syncs remaining today
                </span>
              )}
            </motion.div>
          </div>
        </div>

        {/* ── Web3.ia-inspired Platform Ecosystem Ticker ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 28,
            flexWrap: 'wrap',
            padding: '10px 18px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: 12,
          }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.62rem',
            color: 'var(--text-dim)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}>
            SYNCHRONIZED ECOSYSTEM:
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {['Gmail API', 'LinkedIn Jobs', 'Greenhouse', 'Lever', 'Workday', 'Ashby', 'Notion HQ'].map((partner) => (
              <span
                key={partner}
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.04em',
                }}
              >
                {partner}
              </span>
            ))}
          </div>
        </motion.div>

        {/* ── Main 2-Column Bento Grid ── */}
        <div className="responsive-grid-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '28px', alignItems: 'start' }}>

          {/* LEFT COLUMN: Stat Grid + Time Horizon + Luminous Window Table */}
          <div>
            {/* 4-Stat Strip */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="responsive-stats-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}
            >
              {STATS.map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
                  className="glass-card"
                  style={{ padding: '18px 20px', borderRadius: 16 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-dim)' }}>
                      {s.label}
                    </span>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: `${s.color}15`, border: `1px solid ${s.color}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <s.icon size={14} style={{ color: s.color }} />
                    </div>
                  </div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontSize: '2.2rem',
                    fontWeight: 800, color: '#ffffff', lineHeight: 1,
                  }}>
                    {s.value}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <div style={{ height: 3, flex: 1, background: `linear-gradient(90deg, ${s.color}, transparent)`, borderRadius: 2 }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>{s.sub}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Time Horizon Filter Bar (Pill Selector) */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.18 }}
              className="glass-card time-horizon-bar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 16, flexWrap: 'wrap', gap: 12,
                padding: '10px 18px', borderRadius: 14,
              }}
            >
              <div className="time-horizon-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} style={{ color: '#c084fc' }} />
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

            {/* Status Filter Pills */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22 }}
              className="filter-pills-container"
              style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18, alignItems: 'center' }}
            >
              {ALL_FILTERS.map(f => (
                <button
                  key={f}
                  className={`filter-pill${filter === f ? ' active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </motion.div>

            {/* ── THE LUMINOUS WINDOW: Job Stream Showcase (Craftify Homage) ── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="luminous-window"
            >
              {/* Window Header Bar with macOS dots & Title */}
              <div className="window-top-bar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="window-dots">
                    <div className="window-dot" style={{ background: '#f43f5e' }} />
                    <div className="window-dot" style={{ background: '#f59e0b' }} />
                    <div className="window-dot" style={{ background: '#10b981' }} />
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: '0.78rem',
                    fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.02em',
                  }}>
                    APPLICATION FEED
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: '0.64rem', padding: '3px 10px', borderRadius: 9999,
                    background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)',
                    color: '#c084fc', fontWeight: 600,
                  }}>
                    {filtered.length} ROLES
                  </span>
                </div>
              </div>

              {/* Rows List */}
              <div>
                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '70px 0', gap: 14 }}>
                    <div style={{
                      width: 32, height: 32,
                      border: '2px solid rgba(139, 92, 246, 0.2)',
                      borderTopColor: '#c084fc',
                      borderRadius: '50%',
                      animation: 'spin 0.9s linear infinite'
                    }} />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>
                      SYNCHRONIZING CAREER PIPELINE...
                    </span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ padding: '60px 0', textAlign: 'center' }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                      No applications found in this window
                    </p>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-dim)', marginTop: 4 }}>
                      Try selecting "ALL TIME" or triggering an inbox scan.
                    </p>
                  </div>
                ) : (
                  filtered.map((job, i) => <JobRow key={job.id} job={job} index={i} />)
                )}
              </div>
            </motion.div>
          </div>

          {/* RIGHT COLUMN: AI Safety Orb + Activity Chart + Pipeline Funnel */}
          <div className="dashboard-right-rail">

            {/* AI Safety Centerpiece with Cosmic 3D Sphere (Cerebral AI Style) */}
            <motion.div
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }}
              className="glass-card" style={{ padding: '20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: '#c084fc', fontWeight: 600, letterSpacing: '0.08em' }}>
                    AI SAFETY & SCAM RADAR
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>
                    Pipeline Integrity
                  </div>
                </div>
                <div style={{
                  padding: '4px 10px', borderRadius: 9999,
                  background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)',
                  color: '#34d399', fontSize: '0.64rem', fontWeight: 600
                }}>
                  96.8% Safe
                </div>
              </div>

              {/* Interactive 3D Cosmic Fluid Energy Orb (Cerebral AI & Web3.ia Style) */}
              <div style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, transparent 70%)', display: 'flex', justifyContent: 'center', padding: '6px 0 16px', overflow: 'hidden' }}>
                <CosmicFluidOrb
                  size={290}
                  primaryColor="#8b5cf6"
                  secondaryColor="#ec4899"
                  accentColor="#38bdf8"
                  speedMultiplier={1.0}
                  showTelemetry={true}
                  hudTitle="Neural Pipeline Mesh"
                  hudSubtitle="Continuous Gmail vector sync • 60 FPS WebGL"
                  hudBadge="LIVE"
                  variant="detailed"
                />
              </div>

              {/* Threat & Discovery Metrics */}
              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 10 }}>
                <div className="stat-row">
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    New Leads Discovered
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700, color: '#c084fc' }}>
                    +{opps.length} Opportunities
                  </span>
                </div>
                <div className="stat-row">
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Flagged Phishing / Scams
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700, color: highRisk > 0 ? '#fb7185' : '#34d399' }}>
                    {highRisk} Threats Detected
                  </span>
                </div>
                <div className="stat-row">
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Overall Trust Score
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.82rem', fontWeight: 700, color: '#38bdf8' }}>
                    92.4 / 100
                  </span>
                </div>
              </div>

              <Link href="/hub" style={{ display: 'block', marginTop: 14 }}>
                <button className="btn-neural" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span>Inspect All AI Insights</span>
                  <ArrowRight size={13} />
                </button>
              </Link>
            </motion.div>

            {/* Application Velocity Timeline */}
            <motion.div
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.38 }}
              className="glass-card" style={{ padding: '18px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>
                  APPLICATION VELOCITY
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  Monthly cadence
                </span>
              </div>
              <ActivityChart data={actData.length > 0 ? actData : [
                { label: 'Jan', value: 3 }, { label: 'Feb', value: 9 }, { label: 'Mar', value: 6 },
                { label: 'Apr', value: 18 }, { label: 'May', value: 12 }, { label: 'Jun', value: 7 },
              ]} />
            </motion.div>

            {/* Stage Funnel Conversion */}
            <motion.div
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.44 }}
              className="glass-card" style={{ padding: '18px 20px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.84rem', fontWeight: 700, color: '#ffffff' }}>
                  CONVERSION FUNNEL
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  Stage drop-off
                </span>
              </div>

              {[
                { stage: 'Applied', col: '#94a3b8', n: jobs.filter(j => j.status === 'Applied').length },
                { stage: 'Reviewing', col: '#c084fc', n: jobs.filter(j => j.status === 'Under Review').length },
                { stage: 'OA Sent', col: '#fbbf24', n: jobs.filter(j => j.status === 'OA Sent').length },
                { stage: 'Interview', col: '#38bdf8', n: jobs.filter(j => j.status === 'Interview Scheduled').length },
                { stage: 'Offer', col: '#34d399', n: jobs.filter(j => j.status === 'Offer').length },
              ].map((f, i) => {
                const max = Math.max(...[jobs.filter(j => j.status === 'Applied').length, 1]);
                const pct = Math.round((f.n / max) * 100);
                return (
                  <div key={f.stage} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{f.stage}</span>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.76rem', fontWeight: 700, color: f.col }}>{f.n}</span>
                    </div>
                    <div className="progress-bar">
                      <motion.div
                        className="progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 0.5 + i * 0.08, duration: 0.8 }}
                        style={{ background: f.col }}
                      />
                    </div>
                  </div>
                );
              })}
            </motion.div>

            {/* Quick Refresh Pipeline Button */}
            <button
              onClick={fetchJobs}
              className="btn-ghost"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, width: '100%', padding: '10px 16px',
              }}
            >
              <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh Workspace</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
