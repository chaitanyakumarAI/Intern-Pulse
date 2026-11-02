'use client';

import { useState, type ReactNode } from 'react';
import { CalendarPlus, ExternalLink, Mail, ShieldAlert, Trash2 } from 'lucide-react';
import { Sheet } from './Sheet';
import { Avatar, RiskBadge } from './ui';
import { calendarUrl, dateTime, gmailUrl, relativeTime, safeUrl, shortDate } from '@/lib/format';
import { STATUSES, type Application } from '@/lib/types';

/** Renders the model's prep sheet: "- " / "• " bullets and **bold**; everything is plain text (React escapes it). */
function PrepSheet({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bold = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  return (
    <div className="prep">
      {lines.map((line, i) =>
        /^[-•*]\s+/.test(line)
          ? <p key={i} className="prep-bullet">{bold(line.replace(/^[-•*]\s+/, ''))}</p>
          : <p key={i} className="prep-line">{bold(line)}</p>)}
    </div>
  );
}

/** Older rows carry pipeline internals in their notes; hide them. */
function cleanNotes(notes: string | null): string {
  return (notes ?? '')
    .replace(/\[eid:[^\]]*\]/g, '')
    .replace(/\((?:keyword fallback)\)/gi, '')
    .replace(/\[(?:HIGH|MEDIUM) RISK:[^\]]*\]/g, '')
    .replace(/^Conf: \d+\..*$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function DetailSheet({ app, onClose, onStatus, onNotes, onDelete }: {
  app: Application;
  onClose: () => void;
  onStatus: (status: string) => void;
  onNotes: (notes: string) => void;
  onDelete: () => void;
}) {
  const original = cleanNotes(app.notes);
  const [notes, setNotes] = useState(original);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const link = safeUrl(app.application_link);

  return (
    <Sheet title={app.company} onClose={onClose}>
      <header className="detail-head">
        <Avatar name={app.company} size={52} />
        <div>
          <h2 className="detail-title">{app.company}</h2>
          <p className="muted">{app.role}</p>
        </div>
      </header>

      <div className="status-grid" role="radiogroup" aria-label="Status">
        {STATUSES.map((s) => {
          const active = s.value === app.status;
          return (
            <button
              key={s.value}
              role="radio"
              aria-checked={active}
              className={`status-option${active ? ' active' : ''}`}
              style={active ? { color: s.color, borderColor: s.color, background: `${s.color}22` } : undefined}
              onClick={() => !active && onStatus(s.value)}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="actions">
        {link && (
          <a className="btn btn-primary" href={link} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} /> Open link
          </a>
        )}
        {app.last_gmail_id && (
          <a className="btn" href={gmailUrl(app.last_gmail_id)} target="_blank" rel="noopener noreferrer">
            <Mail size={16} /> Open email
          </a>
        )}
        {app.interview_date && (
          <a
            className="btn"
            href={calendarUrl(`Interview: ${app.company}`, app.interview_date, `${app.role}${link ? `\n${link}` : ''}`)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <CalendarPlus size={16} /> Add to calendar
          </a>
        )}
      </div>

      <dl className="facts">
        {app.interview_date && (<><dt>Interview</dt><dd>{dateTime(app.interview_date)}</dd></>)}
        <dt>Applied</dt><dd>{shortDate(app.applied_date) || '—'}</dd>
        <dt>Updated</dt><dd>{relativeTime(app.last_checked) || '—'}</dd>
        {app.platform && (<><dt>Source</dt><dd>{app.platform}</dd></>)}
        {app.last_subject && (<><dt>Last email</dt><dd>{app.last_subject}</dd></>)}
      </dl>

      {(app.scam_risk === 'High' || app.scam_risk === 'Medium') && (
        <div className={`callout callout-${app.scam_risk.toLowerCase()}`}>
          <ShieldAlert size={18} aria-hidden />
          <div>
            <RiskBadge risk={app.scam_risk} />
            {app.risk_notes && <p>{app.risk_notes}</p>}
          </div>
        </div>
      )}

      {app.prep_sheet && (
        <section className="detail-section">
          <h3>Interview prep</h3>
          <PrepSheet text={app.prep_sheet} />
        </section>
      )}

      <section className="detail-section">
        <h3>Notes</h3>
        <textarea
          className="notes"
          value={notes}
          placeholder="Recruiter name, what to prepare, follow-up date…"
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== original && onNotes(notes)}
          rows={4}
        />
      </section>

      <button
        className={`btn btn-danger btn-block${confirmDelete ? ' confirm' : ''}`}
        onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
      >
        <Trash2 size={16} /> {confirmDelete ? 'Tap again to delete permanently' : 'Delete application'}
      </button>
    </Sheet>
  );
}
