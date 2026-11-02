'use client';

import type { ReactNode } from 'react';
import { ChevronRight, ShieldAlert } from 'lucide-react';
import { hue, initials, relativeTime } from '@/lib/format';
import { statusInfo, type Application } from '@/lib/types';

export function StatusPill({ status }: { status: string }) {
  const info = statusInfo(status);
  return (
    <span className="pill" style={{ color: info.color, background: `${info.color}1f`, borderColor: `${info.color}40` }}>
      {info.label}
    </span>
  );
}

export function RiskBadge({ risk }: { risk: string | null | undefined }) {
  if (risk !== 'High' && risk !== 'Medium') return null;
  return (
    <span className={`risk risk-${risk.toLowerCase()}`}>
      <ShieldAlert size={13} aria-hidden /> {risk} risk
    </span>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hue(name);
  return (
    <span
      className="avatar"
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${h} 45% 22%)`, color: `hsl(${h} 85% 78%)` }}
    >
      {initials(name)}
    </span>
  );
}

export function AppRow({ app, onOpen, meta }: { app: Application; onOpen: (id: string) => void; meta?: ReactNode }) {
  return (
    <button className="row" onClick={() => onOpen(app.id)}>
      <Avatar name={app.company} />
      <span className="row-main">
        <span className="row-title">{app.company}</span>
        <span className="row-sub">{app.role}</span>
      </span>
      <span className="row-side">
        <StatusPill status={app.status} />
        <span className="row-meta">{meta ?? relativeTime(app.last_checked)}</span>
      </span>
    </button>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LinkCard({ icon, title, detail, onClick, tone = 'default' }: {
  icon: ReactNode; title: string; detail?: string; onClick: () => void; tone?: 'default' | 'warn' | 'danger' | 'accent';
}) {
  return (
    <button className={`link-card tone-${tone}`} onClick={onClick}>
      <span className="link-card-icon">{icon}</span>
      <span className="row-main">
        <span className="row-title">{title}</span>
        {detail && <span className="row-sub">{detail}</span>}
      </span>
      <ChevronRight size={18} className="muted" aria-hidden />
    </button>
  );
}

export function Empty({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      <p className="empty-title">{title}</p>
      {detail && <p className="empty-detail">{detail}</p>}
    </div>
  );
}
