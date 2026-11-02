'use client';

import { useMemo, useState } from 'react';
import {
  Bookmark, BookmarkCheck, CircleCheck, Database, ExternalLink, EyeOff, Inbox, KeyRound,
  LogOut, RefreshCw, Search, ShieldAlert, ShieldCheck, Smartphone, Sparkles, TriangleAlert, X,
} from 'lucide-react';
import { AppRow, Empty, LinkCard, RiskBadge, Section, StatusPill } from './ui';
import { dateTime, isFuture, relativeTime, safeUrl } from '@/lib/format';
import { ACTIVE_STATUSES, STATUSES, type AppState, type Opportunity } from '@/lib/types';

export const APK_URL = 'https://github.com/chaitanyakumarAI/Intern-Pulse/releases/download/android-latest/InternPulse.apk';

type Open = (id: string) => void;

// ── Today ─────────────────────────────────────────────────────────────────────

export function Today({ data, onOpen, onFilter, onRadar }: {
  data: AppState; onOpen: Open; onFilter: (f: string) => void; onRadar: () => void;
}) {
  const apps = data.applications;
  const interviews = apps
    .filter((a) => a.status === 'Interview Scheduled')
    .sort((a, b) => (a.interview_date ?? '9999').localeCompare(b.interview_date ?? '9999'));
  const tests = apps.filter((a) => a.status === 'OA Sent');
  const review = apps.filter((a) => a.status === 'Needs Review').length;
  const newLeads = data.opportunities.filter((o) => o.status === 'new').length;
  const risky = apps.filter((a) => a.scam_risk === 'High' && ACTIVE_STATUSES.has(a.status));
  const active = apps.filter((a) => ACTIVE_STATUSES.has(a.status)).length;
  const offers = apps.filter((a) => a.status === 'Offer').length;
  const responded = apps.filter((a) => !['Applied', 'Needs Review', 'Ghosted'].includes(a.status)).length;
  const rate = apps.length ? Math.round((responded / apps.length) * 100) : 0;

  if (!apps.length && !data.opportunities.length) {
    return <Empty icon={<Inbox size={28} />} title="Nothing tracked yet" detail="Tap the sync button to scan your Gmail for applications." />;
  }

  return (
    <>
      <div className="stats">
        <button className="stat" onClick={() => onFilter('active')}><b>{active}</b><span>Active</span></button>
        <button className="stat" onClick={() => onFilter('Interview Scheduled')}><b>{interviews.length}</b><span>Interviews</span></button>
        <button className="stat" onClick={() => onFilter('Offer')}><b>{offers}</b><span>Offers</span></button>
        <div className="stat"><b>{rate}%</b><span>Replies</span></div>
      </div>

      {(review > 0 || newLeads > 0 || risky.length > 0) && (
        <div className="stack">
          {risky.length > 0 && (
            <LinkCard tone="danger" icon={<ShieldAlert size={20} />} title={`${risky.length} high-risk compan${risky.length > 1 ? 'ies' : 'y'}`}
              detail={risky.map((a) => a.company).join(', ')} onClick={() => onOpen(risky[0].id)} />
          )}
          {review > 0 && (
            <LinkCard tone="warn" icon={<TriangleAlert size={20} />} title={`${review} need${review === 1 ? 's' : ''} review`}
              detail="The classifier wasn't sure. Set the right status." onClick={() => onFilter('Needs Review')} />
          )}
          {newLeads > 0 && (
            <LinkCard tone="accent" icon={<Sparkles size={20} />} title={`${newLeads} new job lead${newLeads === 1 ? '' : 's'}`}
              detail="From your job alert emails" onClick={onRadar} />
          )}
        </div>
      )}

      <Section title="Up next">
        {interviews.length + tests.length === 0 ? (
          <p className="muted small">No interviews or assessments waiting.</p>
        ) : (
          <div className="list">
            {interviews.map((a) => (
              <AppRow key={a.id} app={a} onOpen={onOpen}
                meta={a.interview_date ? (isFuture(a.interview_date) ? dateTime(a.interview_date) : 'Done?') : 'Date unknown'} />
            ))}
            {tests.map((a) => <AppRow key={a.id} app={a} onOpen={onOpen} meta={relativeTime(a.last_checked)} />)}
          </div>
        )}
      </Section>

      <Section title="Recent activity" action={<button className="text-btn" onClick={() => onFilter('all')}>See all</button>}>
        <div className="list">
          {apps.slice(0, 6).map((a) => <AppRow key={a.id} app={a} onOpen={onOpen} />)}
        </div>
      </Section>
    </>
  );
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

export function Pipeline({ data, filter, setFilter, onOpen }: {
  data: AppState; filter: string; setFilter: (f: string) => void; onOpen: Open;
}) {
  const [query, setQuery] = useState('');
  const apps = data.applications;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: apps.length, active: 0 };
    for (const a of apps) {
      c[a.status] = (c[a.status] ?? 0) + 1;
      if (ACTIVE_STATUSES.has(a.status)) c.active += 1;
    }
    return c;
  }, [apps]);

  const chips = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    ...STATUSES.map((s) => ({ key: s.value as string, label: s.label })),
  ].filter((c) => c.key === 'all' || c.key === filter || counts[c.key]);

  const q = query.trim().toLowerCase();
  const shown = apps.filter((a) =>
    (filter === 'all' || (filter === 'active' ? ACTIVE_STATUSES.has(a.status) : a.status === filter)) &&
    (!q || a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q)));

  return (
    <>
      <label className="search">
        <Search size={18} aria-hidden />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search company or role" enterKeyHint="search" />
        {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Clear search"><X size={16} /></button>}
      </label>

      <div className="chips" role="tablist" aria-label="Filter by status">
        {chips.map((c) => (
          <button key={c.key} role="tab" aria-selected={filter === c.key} className={`chip${filter === c.key ? ' active' : ''}`} onClick={() => setFilter(c.key)}>
            {c.label} <span className="chip-count">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="list">{shown.map((a) => <AppRow key={a.id} app={a} onOpen={onOpen} />)}</div>
      ) : (
        <Empty icon={<Search size={26} />} title="No matches" detail={q ? `Nothing matches “${query}”.` : 'Nothing in this stage.'} />
      )}
    </>
  );
}

// ── Radar ─────────────────────────────────────────────────────────────────────

function LeadCard({ lead, onStatus }: { lead: Opportunity; onStatus: (status: Opportunity['status']) => void }) {
  const link = safeUrl(lead.link);
  const saved = lead.status === 'saved';
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3 className="row-title">{lead.role}</h3>
          <p className="row-sub">{lead.company}{lead.platform ? ` · ${lead.platform}` : ''}</p>
        </div>
        <span className="row-meta">{relativeTime(lead.first_seen)}</span>
      </div>
      <RiskBadge risk={lead.scam_risk} />
      <div className="card-actions">
        {link && <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open</a>}
        <button className="btn" onClick={() => onStatus(saved ? 'new' : 'saved')}>
          {saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? 'Saved' : 'Save'}
        </button>
        <button className="btn btn-ghost" onClick={() => onStatus('dismissed')} aria-label={`Dismiss ${lead.role} at ${lead.company}`}>
          <EyeOff size={16} /> Hide
        </button>
      </div>
    </article>
  );
}

export function Radar({ data, onOpen, onLeadStatus }: {
  data: AppState; onOpen: Open; onLeadStatus: (id: string, status: Opportunity['status']) => void;
}) {
  const [view, setView] = useState<'leads' | 'risks'>('leads');
  const leads = [...data.opportunities].sort((a, b) => Number(b.status === 'saved') - Number(a.status === 'saved'));
  const risks = data.applications.filter((a) => a.scam_risk === 'High' || a.scam_risk === 'Medium');

  return (
    <>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={view === 'leads'} className={view === 'leads' ? 'active' : ''} onClick={() => setView('leads')}>
          Job leads <span className="chip-count">{leads.length}</span>
        </button>
        <button role="tab" aria-selected={view === 'risks'} className={view === 'risks' ? 'active' : ''} onClick={() => setView('risks')}>
          Scam alerts <span className="chip-count">{risks.length}</span>
        </button>
      </div>

      {view === 'leads' ? (
        leads.length ? (
          <div className="stack">{leads.map((l) => <LeadCard key={l.id} lead={l} onStatus={(s) => onLeadStatus(l.id, s)} />)}</div>
        ) : (
          <Empty icon={<Sparkles size={26} />} title="No job leads yet"
            detail={data.setup.cloudState ? 'Roles found in LinkedIn, Internshala and Unstop alert emails appear here.' : 'Run supabase_schema.sql to start collecting leads from job alert emails.'} />
        )
      ) : risks.length ? (
        <div className="stack">
          {risks.map((a) => (
            <button key={a.id} className="card card-button" onClick={() => onOpen(a.id)}>
              <div className="card-head">
                <div>
                  <h3 className="row-title">{a.company}</h3>
                  <p className="row-sub">{a.role}</p>
                </div>
                <StatusPill status={a.status} />
              </div>
              <RiskBadge risk={a.scam_risk} />
              {a.risk_notes && <p className="small muted clamp">{a.risk_notes}</p>}
            </button>
          ))}
        </div>
      ) : (
        <Empty icon={<ShieldCheck size={26} />} title="No scam warnings" detail="Fee requests, spoofed senders and known fake-internship platforms are flagged here." />
      )}
    </>
  );
}

// ── More ──────────────────────────────────────────────────────────────────────

function Check({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className="check">
      {ok ? <CircleCheck size={18} className="ok" aria-label="OK" /> : <TriangleAlert size={18} className="warn" aria-label="Needs attention" />}
      <div>
        <p className="row-title">{title}</p>
        <p className="row-sub">{detail}</p>
      </div>
    </div>
  );
}

export function More({ data, savedAt, onSync, onSignOut }: {
  data: AppState; savedAt: number | null; onSync: (days?: number) => void; onSignOut: () => void;
}) {
  const { sync, setup } = data;
  const last = sync.lastRun;
  const quota = sync.quota;

  return (
    <>
      <Section title="Sync">
        <div className="card">
          <p className="row-title">
            {sync.running ? 'Syncing now…' : last ? `Last sync ${relativeTime(last.started_at)}` : 'No syncs recorded yet'}
          </p>
          {last && !sync.running && (
            <p className={`row-sub${last.status === 'error' ? ' danger' : ''}`}>
              {last.status === 'error'
                ? `Failed: ${last.error ?? 'unknown error'}`
                : last.stats ? `${last.stats.new ?? 0} new emails · ${last.stats.created ?? 0} added · ${last.stats.updated ?? 0} updated` : 'Completed'}
              {last.trigger ? ` · ${last.trigger}` : ''}
            </p>
          )}
          {quota && (
            <div className="meter" aria-label={`${quota.used} of ${quota.limit} syncs used today`}>
              <span style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} />
            </div>
          )}
          {quota && <p className="row-sub">{quota.used} of {quota.limit} syncs used today · resets 00:00 UTC</p>}
          <p className="row-sub">Automatic sync every 3 hours.</p>
          <div className="card-actions">
            <button className="btn btn-primary" disabled={sync.running} onClick={() => onSync()}><RefreshCw size={16} /> Sync now</button>
            <button className="btn" disabled={sync.running} onClick={() => onSync(30)}>Deep scan (30 days)</button>
          </div>
        </div>
      </Section>

      <Section title="Setup">
        <div className="card stack-tight">
          <Check ok={setup.database === 'secret'} title="Database access"
            detail={setup.database === 'secret' ? 'Connected with the private server key.' : setup.database === 'public'
              ? 'Using the public anon key. Set SUPABASE_KEY to the secret key on Vercel.' : data.source === 'local' ? 'Local files (development).' : 'Not configured.'} />
          <Check ok={setup.cloudState} title="Sync history & job leads"
            detail={setup.cloudState ? 'Enabled.' : 'Run supabase_schema.sql in the Supabase SQL editor.'} />
          <Check ok={setup.auth} title="Login"
            detail={setup.auth ? 'Password protected.' : 'Anyone with the link can see your data. Set DASHBOARD_PASSWORD on Vercel.'} />
        </div>
      </Section>

      <Section title="App">
        <div className="stack">
          <a className="link-card" href={APK_URL}>
            <span className="link-card-icon"><Smartphone size={20} /></span>
            <span className="row-main"><span className="row-title">Download Android app</span><span className="row-sub">Latest APK from GitHub</span></span>
          </a>
          {setup.auth && (
            <button className="link-card" onClick={onSignOut}>
              <span className="link-card-icon"><LogOut size={20} /></span>
              <span className="row-main"><span className="row-title">Sign out</span><span className="row-sub">Also clears data saved on this device</span></span>
            </button>
          )}
        </div>
        <p className="small muted center">
          <Database size={12} aria-hidden /> {data.applications.length} applications · <KeyRound size={12} aria-hidden /> {data.source}
          {savedAt ? ` · refreshed ${relativeTime(new Date(savedAt).toISOString())}` : ''}
        </p>
      </Section>
    </>
  );
}
