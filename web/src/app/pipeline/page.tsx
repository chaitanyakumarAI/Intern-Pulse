'use client';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from '@/components/Sidebar';
import { Shield, MapPin, Calendar, Sparkles, ExternalLink } from 'lucide-react';

const CosmicFluidOrb = dynamic(() => import('@/components/CosmicFluidOrb'), { ssr: false });

interface Job {
  id: string;
  company: string;
  role: string;
  status: string;
  platform: string;
  date: string;
  scam_risk?: string;
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

const COLUMNS = [
  { key: 'Applied',             label: 'APPLIED',     color: '#cbd5e1', border: 'rgba(203, 213, 225, 0.3)' },
  { key: 'Under Review',        label: 'REVIEWING',   color: '#c084fc', border: 'rgba(192, 132, 252, 0.35)' },
  { key: 'OA Sent',             label: 'OA SENT',     color: '#fbbf24', border: 'rgba(251, 191, 36, 0.35)' },
  { key: 'Interview Scheduled', label: 'INTERVIEWS',  color: '#38bdf8', border: 'rgba(56, 189, 248, 0.35)' },
  { key: 'Offer',               label: 'OFFERS',      color: '#34d399', border: 'rgba(52, 211, 153, 0.4)' },
  { key: 'Rejected',            label: 'REJECTED',    color: '#fb7185', border: 'rgba(251, 113, 133, 0.3)' },
  { key: 'Job Opportunity',     label: 'NEW LEADS',   color: '#f472b6', border: 'rgba(244, 114, 182, 0.35)' },
];

const RISK_COLOR: Record<string, string> = {
  Low: '#34d399',
  Medium: '#fbbf24',
  High: '#fb7185',
  Unknown: 'var(--text-dim)'
};

const AVATAR_PALETTE = [
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
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function KanbanCard({ job, colColor, onDragStart }: { job: Job; colColor: string; onDragStart: (e: React.DragEvent) => void }) {
  const [fg, bg] = getAvatarColor(job.company);
  const initials = getInitials(job.company);
  const risk = job.scam_risk ?? 'Unknown';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        background: 'rgba(16, 20, 40, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 12,
        marginBottom: 10,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        cursor: 'grab',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${colColor}55`;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 6px 20px rgba(0, 0, 0, 0.45), 0 0 16px ${colColor}20`;
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.35)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${colColor}, transparent)`, opacity: 0.8 }} />

      <div style={{ padding: '14px 14px 12px' }}>
        {/* Avatar + Company Name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: bg, color: fg, border: `1px solid ${fg}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.76rem',
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: '0.84rem',
              fontWeight: 700, color: '#ffffff', lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {job.company}
            </div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: '0.74rem',
              color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {job.role}
            </div>
          </div>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <MapPin size={10} style={{ color: 'var(--text-dim)' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
              {job.platform}
            </span>
          </div>

          {risk !== 'Unknown' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 7px', borderRadius: 9999,
              background: `${RISK_COLOR[risk]}12`, border: `1px solid ${RISK_COLOR[risk]}30`
            }}>
              <Shield size={9} style={{ color: RISK_COLOR[risk] }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 600, color: RISK_COLOR[risk] }}>
                {risk}
              </span>
            </div>
          )}
        </div>

        {/* OA link */}
        {job.oa_link && (
          <a
            href={job.oa_link}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              marginTop: 10, fontFamily: 'var(--font-body)', fontSize: '0.66rem',
              color: '#38bdf8', fontWeight: 600,
            }}
          >
            <span>Assessment link</span>
            <ExternalLink size={10} />
          </a>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
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

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('jobId', jobId);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('jobId');
    if (!jobId) return;

    const job = jobs.find(j => j.id === jobId);
    if (!job || job.status === targetStatus) return;

    // Optimistically update
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: targetStatus } : j));

    // Update backend
    try {
      await fetch('/api/jobs/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: jobId, status: targetStatus })
      });
    } catch (err) {
      console.error('API Error:', err);
    }
  };

  const timeFilteredJobs = jobs.filter(j => isWithinDays(j.date, timeRange));

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
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
            <span style={{ fontWeight: 600, color: '#ffffff' }}>Job Board</span>
            <span className="sep desktop-only">·</span>
            <span className="desktop-only">Interactive Stage Kanban</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span className="desktop-only">Drag cards across columns to sync status</span>
            <span className="mobile-only" style={{ fontSize: '0.66rem', color: '#38bdf8', fontWeight: 600 }}>Swipe stages →</span>
          </div>
        </div>

        {/* Hero Section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
            <div>
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
                  <span>Interactive Pipeline Workflow • Live Notion Sync</span>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="hero-headline">
                  Stage Pipeline, <br className="desktop-only" />
                  <span className="gradient-accent">Fluid & Visual.</span>
                </h1>
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.88rem',
                  color: 'var(--text-muted)', marginTop: 8, maxWidth: 540,
                  lineHeight: 1.6
                }}>
                  Drag candidate cards across stages to automatically synchronize application status in Notion and trigger interview prep sheets.
                </p>
              </motion.div>
            </div>

            {/* Compact 3D Cosmic Fluid Orb Centerpiece for Kanban */}
            <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', paddingRight: 8, overflow: 'hidden' }}>
              <CosmicFluidOrb
                size={220}
                primaryColor="#38bdf8"
                secondaryColor="#8b5cf6"
                accentColor="#34d399"
                speedMultiplier={0.9}
                showTelemetry={true}
                hudTitle="Stage Dynamics"
                hudSubtitle="7 Pipeline Stages Synchronized"
                hudBadge="SYNC ON"
                variant="compact"
              />
            </div>
          </div>
        </div>

        {/* Time Horizon Filter Bar */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
          className="glass-card time-horizon-bar"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 24, flexWrap: 'wrap', gap: 12,
            padding: '10px 18px', borderRadius: 14,
          }}
        >
          <div className="time-horizon-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} style={{ color: '#38bdf8' }} />
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

        {/* Kanban Board Container */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '100px 0', gap: 14 }}>
            <div style={{
              width: 32, height: 32,
              border: '2px solid rgba(56, 189, 248, 0.2)',
              borderTopColor: '#38bdf8',
              borderRadius: '50%',
              animation: 'spin 0.9s linear infinite'
            }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              LOADING PIPELINE STAGES...
            </span>
          </div>
        ) : (
          <div className="kanban-board">
            {COLUMNS.map((col, ci) => {
              const colJobs = jobs.filter(j => j.status === col.key && isWithinDays(j.date, timeRange));
              return (
                <motion.div
                  key={col.key}
                  className="kanban-column"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: ci * 0.05 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, col.key)}
                >
                  {/* Column Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: col.color, boxShadow: `0 0 8px ${col.color}` }} />
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: '0.78rem', fontWeight: 700,
                        color: '#ffffff', letterSpacing: '0.04em',
                      }}>
                        {col.label}
                      </span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.66rem', fontWeight: 700,
                      color: col.color, background: `${col.color}15`,
                      border: `1px solid ${col.border}`, padding: '2px 8px', borderRadius: 9999,
                    }}>
                      {colJobs.length}
                    </span>
                  </div>

                  {/* Cards inside column */}
                  <AnimatePresence>
                    {colJobs.length === 0 ? (
                      <div style={{
                        height: 80, border: '1px dashed rgba(255, 255, 255, 0.08)', borderRadius: 12,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-dim)',
                      }}>
                        Drag jobs here
                      </div>
                    ) : (
                      colJobs.map((job, i) => (
                        <motion.div
                          key={job.id}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: ci * 0.03 + i * 0.03 }}
                          layoutId={job.id}
                        >
                          <KanbanCard job={job} colColor={col.color} onDragStart={(e) => handleDragStart(e, job.id)} />
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
