export type Status =
  | 'Applied'
  | 'Under Review'
  | 'OA Sent'
  | 'Interview Scheduled'
  | 'Offer'
  | 'Rejected'
  | 'Ghosted'
  | 'Needs Review'
  | 'Job Opportunity'
  | 'Unknown';

export interface StatusInfo {
  value: Status;
  label: string;
  color: string;
}

/** Statuses you can set by hand, in pipeline order. */
export const STATUSES: StatusInfo[] = [
  { value: 'Needs Review', label: 'Needs review', color: '#fb923c' },
  { value: 'Applied', label: 'Applied', color: '#60a5fa' },
  { value: 'Under Review', label: 'In review', color: '#a78bfa' },
  { value: 'OA Sent', label: 'Assessment', color: '#fbbf24' },
  { value: 'Interview Scheduled', label: 'Interview', color: '#22d3ee' },
  { value: 'Offer', label: 'Offer', color: '#34d399' },
  { value: 'Rejected', label: 'Rejected', color: '#f87171' },
  { value: 'Ghosted', label: 'Ghosted', color: '#94a3b8' },
];

export const EDITABLE_STATUSES = new Set<string>(STATUSES.map((s) => s.value));

export function statusInfo(status: string): StatusInfo {
  return STATUSES.find((s) => s.value === status) ?? { value: 'Unknown', label: status || 'Unknown', color: '#94a3b8' };
}

export const ACTIVE_STATUSES = new Set<string>(['Applied', 'Under Review', 'OA Sent', 'Interview Scheduled']);

export type Risk = 'High' | 'Medium' | 'Low' | 'Unknown';

export interface Application {
  id: string;
  company: string;
  role: string;
  status: Status;
  platform: string | null;
  applied_date: string | null;
  last_checked: string | null;
  application_link: string | null;
  scam_risk: Risk | null;
  risk_notes: string | null;
  prep_sheet: string | null;
  notes: string | null;
  interview_date?: string | null;
  last_subject?: string | null;
  last_gmail_id?: string | null;
}

export interface Opportunity {
  id: string;
  company: string;
  role: string;
  link: string | null;
  platform: string | null;
  scam_risk: Risk | null;
  risk_notes: string | null;
  status: 'new' | 'saved' | 'dismissed';
  first_seen: string;
}

export interface SyncRun {
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'success' | 'error';
  trigger: string | null;
  stats: Record<string, number> | null;
  error: string | null;
}

export interface SyncInfo {
  running: boolean;
  lastRun: SyncRun | null;
  quota: { used: number; limit: number; remaining: number } | null;
}

export interface Setup {
  /** Which Supabase key the server uses: 'secret' can read private tables; 'public' can't. */
  database: 'secret' | 'public' | 'none';
  /** Sync history, processed emails and opportunities tables exist. */
  cloudState: boolean;
  /** DASHBOARD_PASSWORD is set. */
  auth: boolean;
}

export interface AppState {
  applications: Application[];
  opportunities: Opportunity[];
  sync: SyncInfo;
  setup: Setup;
  source: 'database' | 'local' | 'none';
  error?: string;
}
