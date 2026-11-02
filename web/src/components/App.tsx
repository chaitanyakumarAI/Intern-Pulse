'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { House, LayoutList, Radar as RadarIcon, RefreshCw, Settings, WifiOff } from 'lucide-react';
import { useAppData, clearCache } from './useAppData';
import { DetailSheet } from './DetailSheet';
import { Today, Pipeline, Radar, More } from './views';
import { relativeTime } from '@/lib/format';

type Tab = 'today' | 'pipeline' | 'radar' | 'more';
const TABS: { key: Tab; label: string; icon: typeof House }[] = [
  { key: 'today', label: 'Today', icon: House },
  { key: 'pipeline', label: 'Pipeline', icon: LayoutList },
  { key: 'radar', label: 'Radar', icon: RadarIcon },
  { key: 'more', label: 'More', icon: Settings },
];
const TITLES: Record<Tab, string> = { today: 'Today', pipeline: 'Pipeline', radar: 'Radar', more: 'More' };

function tabFromHash(): Tab {
  const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return (TABS.some((t) => t.key === h) ? h : 'today') as Tab;
}

const PULL_TRIGGER = 70;

export default function App() {
  const app = useAppData();
  const { data } = app;
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [pull, setPull] = useState(0);
  const pullStart = useRef<number | null>(null);
  const pushedTab = useRef(false);

  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  }, []);

  // Android back button: tabs and the detail sheet live in browser history.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      setOpenId((e.state as { sheet?: string } | null)?.sheet ?? null);
      setTab(tabFromHash());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goTab = useCallback((next: Tab) => {
    if (next === tab) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const url = next === 'today' ? window.location.pathname : `#${next}`;
    if (tab === 'today') {
      window.history.pushState(null, '', url);
      pushedTab.current = true;
    } else if (next === 'today' && pushedTab.current) {
      pushedTab.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', url);
    }
    setTab(next);
    window.scrollTo({ top: 0 });
  }, [tab]);

  const showFilter = useCallback((f: string) => {
    setFilter(f);
    goTab('pipeline');
  }, [goTab]);

  const openSheet = useCallback((id: string) => {
    window.history.pushState({ sheet: id }, '', window.location.hash || window.location.pathname);
    setOpenId(id);
  }, []);

  const closeSheet = useCallback(() => {
    if ((window.history.state as { sheet?: string } | null)?.sheet) window.history.back();
    else setOpenId(null);
  }, []);

  const sync = useCallback(async (days?: number) => {
    if (!app.online) return say("You're offline", true);
    try {
      say(await app.startSync(days ? { days } : {}));
    } catch (e) {
      say((e as Error).message, true);
    }
  }, [app, say]);

  const guarded = useCallback(async (action: () => Promise<void>, done: string) => {
    if (!app.online) return say("You're offline: changes need a connection", true);
    try {
      await action();
      say(done);
    } catch (e) {
      say((e as Error).message, true);
    }
  }, [app.online, say]);

  // Pull to refresh (Android WebView has no native one).
  const onTouchStart = (e: React.TouchEvent) => {
    pullStart.current = window.scrollY <= 0 && !openId ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStart.current === null) return;
    setPull(Math.max(0, Math.min(110, (e.touches[0].clientY - pullStart.current) * 0.5)));
  };
  const onTouchEnd = () => {
    if (pull >= PULL_TRIGGER) void app.refresh();
    pullStart.current = null;
    setPull(0);
  };

  const opened = openId ? data?.applications.find((a) => a.id === openId) : undefined;
  const running = data?.sync.running ?? false;
  const stale = !app.online || (!!app.error && !!data);

  return (
    <div className="app" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <header className="topbar">
        <div>
          <h1>{TITLES[tab]}</h1>
          <p className="topbar-sub">
            {running ? 'Syncing Gmail…' : data?.sync.lastRun ? `Synced ${relativeTime(data.sync.lastRun.started_at)}` : 'InternPulse'}
          </p>
        </div>
        <button className={`icon-btn sync-btn${running ? ' spinning' : ''}`} onClick={() => sync()} disabled={running} aria-label="Sync Gmail now">
          <RefreshCw size={20} />
        </button>
      </header>

      <div className="pull" style={{ height: pull }} aria-hidden>
        <RefreshCw size={18} className={pull >= PULL_TRIGGER ? 'ready' : ''} style={{ transform: `rotate(${pull * 3}deg)` }} />
      </div>
      {app.loading && !pull && <div className="progress" aria-hidden />}

      {stale && (
        <div className="banner">
          <WifiOff size={16} aria-hidden />
          {app.online ? app.error : 'Offline'}{app.savedAt ? ` · showing data from ${relativeTime(new Date(app.savedAt).toISOString())}` : ''}
        </div>
      )}

      <main className="content">
        {!data ? (
          app.error ? (
            <div className="empty"><p className="empty-title">Couldn&apos;t load your data</p><p className="empty-detail">{app.error}</p>
              <button className="btn btn-primary" onClick={() => app.refresh()}>Try again</button></div>
          ) : (
            <div className="skeleton-list" aria-label="Loading">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" />)}</div>
          )
        ) : tab === 'today' ? (
          <Today data={data} onOpen={openSheet} onFilter={showFilter} onRadar={() => goTab('radar')} />
        ) : tab === 'pipeline' ? (
          <Pipeline data={data} filter={filter} setFilter={setFilter} onOpen={openSheet} />
        ) : tab === 'radar' ? (
          <Radar data={data} onOpen={openSheet}
            onLeadStatus={(id, s) => guarded(() => app.updateOpportunity(id, s), s === 'dismissed' ? 'Hidden' : s === 'saved' ? 'Saved' : 'Unsaved')} />
        ) : (
          <More data={data} savedAt={app.savedAt} onSync={sync}
            onSignOut={async () => {
              await fetch('/api/login', { method: 'DELETE' });
              clearCache();
              if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
              window.location.href = '/login';
            }} />
        )}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ key, label, icon: Icon }) => {
          const badge = key === 'radar' ? data?.opportunities.filter((o) => o.status === 'new').length : key === 'pipeline'
            ? data?.applications.filter((a) => a.status === 'Needs Review').length : 0;
          return (
            <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => goTab(key)} aria-current={tab === key ? 'page' : undefined}>
              <span className="tab-icon"><Icon size={22} />{badge ? <span className="badge">{badge > 9 ? '9+' : badge}</span> : null}</span>
              {label}
            </button>
          );
        })}
      </nav>

      {opened && (
        <DetailSheet
          key={opened.id}
          app={opened}
          onClose={closeSheet}
          onStatus={(status) => guarded(() => app.updateApplication(opened.id, { status: status as typeof opened.status }), 'Status updated')}
          onNotes={(notes) => guarded(() => app.updateApplication(opened.id, { notes }), 'Notes saved')}
          onDelete={() => guarded(async () => { closeSheet(); await app.deleteApplication(opened.id); }, 'Deleted')}
        />
      )}

      {toast && <div className={`toast${toast.error ? ' toast-error' : ''}`} role="status">{toast.text}</div>}
    </div>
  );
}
