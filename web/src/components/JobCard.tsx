'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { Building2, Calendar, Shield, ChevronDown, ExternalLink } from 'lucide-react';
import TiltCard from './TiltCard';

interface Job {
  id: string; company: string; role: string; status: string;
  platform: string; date: string; scam_risk?: string;
  risk_notes?: string; prep_sheet?: string; oa_link?: string;
}

const STATUS_CONFIG: Record<string, { badge: string; accent: string; glow: string }> = {
  'Applied':             { badge: 'badge-applied',      accent: 'rgba(180,188,230,0.7)', glow: 'rgba(180,188,230,0.1)' },
  'Under Review':        { badge: 'badge-review',       accent: '#a855f7',               glow: 'rgba(168,85,247,0.15)' },
  'OA Sent':             { badge: 'badge-oa',            accent: '#ff8c00',               glow: 'rgba(255,140,0,0.15)'  },
  'Interview Scheduled': { badge: 'badge-interview',    accent: '#00c8ff',               glow: 'rgba(0,200,255,0.15)'  },
  'Offer':               { badge: 'badge-offer',         accent: '#00ff88',               glow: 'rgba(0,255,136,0.2)'   },
  'Rejected':            { badge: 'badge-rejected',      accent: '#ff5566',               glow: 'rgba(255,85,102,0.1)'  },
  'Job Opportunity':     { badge: 'badge-opportunity',   accent: '#ff0080',               glow: 'rgba(255,0,128,0.15)'  },
};

const RISK_CONFIG: Record<string, { color: string }> = {
  Low:     { color: 'var(--accent-green)'  },
  Medium:  { color: 'var(--accent-orange)' },
  High:    { color: '#ff5566'              },
  Unknown: { color: 'var(--text-dim)'      },
};

export default function JobCard({ job, index }: { job: Job; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg     = STATUS_CONFIG[job.status] ?? STATUS_CONFIG['Applied'];
  const riskCfg = RISK_CONFIG[job.scam_risk ?? 'Unknown'];

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
    >
      <TiltCard glowColor={cfg.glow} className="rounded-sm mb-3 cursor-pointer">
        {/* Left accent bar */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: cfg.accent, opacity: 0.75, borderRadius: '0 2px 2px 0' }} />

        <div style={{ padding: '14px 16px 14px 18px' }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Company */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Building2 size={10} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                  {job.company.toUpperCase()}
                </span>
              </div>
              {/* Role */}
              <div className="glitch-text" data-text={job.role}>
                <h3 style={{ fontFamily: 'var(--font-body)', fontSize: '0.92rem', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {job.role}
                </h3>
              </div>
            </div>

            {/* Badge + Chevron */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
              <span className={`badge ${cfg.badge}`}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.accent, display: 'inline-block' }} />
                {job.status}
              </span>
              <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                <ChevronDown size={11} style={{ color: 'var(--text-dim)' }} />
              </motion.div>
            </div>
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Calendar size={9} style={{ color: 'var(--text-dim)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-dim)' }}>{job.date}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: 'var(--text-dim)' }}>via {job.platform}</span>
            {job.scam_risk && job.scam_risk !== 'Unknown' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                <Shield size={9} style={{ color: riskCfg.color }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', color: riskCfg.color }}>
                  {job.scam_risk} RISK
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Expandable */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ height: 1, background: `linear-gradient(90deg, ${cfg.accent}40, transparent)`, margin: '0 18px' }} />
              <div style={{ padding: '12px 18px 16px' }}>
                {job.risk_notes && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
                      ▸ RISK ANALYSIS
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.65 }}>
                      {job.risk_notes}
                    </p>
                  </div>
                )}
                {job.prep_sheet && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.56rem', letterSpacing: '0.1em', color: 'var(--accent-cyan)', marginBottom: 6 }}>
                      ▸ INTERVIEW PREP SHEET
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                      {job.prep_sheet}
                    </p>
                  </div>
                )}
                {job.oa_link && (
                  <a href={job.oa_link} target="_blank" rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--accent-cyan)', textDecoration: 'none', padding: '4px 10px', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 3, transition: 'all 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,200,255,0.08)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <ExternalLink size={10} /> OA LINK →
                  </a>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </TiltCard>
    </motion.div>
  );
}
