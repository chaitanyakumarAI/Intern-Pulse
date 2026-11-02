'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Application, Opportunity, SyncInfo } from '@/lib/types';

const CACHE_KEY = 'internpulse:state:v1';
const SYNC_POLL_MS = 4000;
const REFRESH_AFTER_MS = 30_000;

interface Cached {
  state: AppState;
  savedAt: number;
}

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    return null;
  }
}

function writeCache(state: AppState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ state, savedAt: Date.now() }));
  } catch {
    // storage full or blocked: the app still works, it just won't open instantly next time
  }
}

export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
    throw new Error('Signed out');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || body.error || `Request failed (${res.status})`);
  return body as T;
}

/**
 * The app's single data store: shows the cached copy instantly, refreshes in the
 * background, applies edits optimistically and follows a running sync.
 */
export function useAppData() {
  const [initial] = useState(readCache);
  const [data, setData] = useState<AppState | null>(initial?.state ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(initial?.savedAt ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const lastRefresh = useRef(0);

  const commit = useCallback((next: AppState) => {
    setData(next);
    setSavedAt(Date.now());
    writeCache(next);
  }, []);

  const refresh = useCallback(async () => {
    lastRefresh.current = Date.now();
    setLoading(true);
    try {
      commit(await api<AppState>('/api/state'));
      setError(null);
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : null);
    } finally {
      setLoading(false);
    }
  }, [commit]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRefresh.current > REFRESH_AFTER_MS) void refresh();
    };
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearTimeout(first);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  // While a sync runs (started here, or the 3-hourly one), poll its status; reload data when it ends.
  const running = data?.sync.running ?? false;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(async () => {
      try {
        const sync = await api<SyncInfo>('/api/scan');
        if (sync.running) {
          setData((prev) => (prev ? { ...prev, sync } : prev));
        } else {
          clearInterval(timer);
          await refresh();
        }
      } catch {
        // offline or worker waking up: keep polling
      }
    }, SYNC_POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const startSync = useCallback(async (options: { days?: number; force?: boolean } = {}) => {
    const res = await api<{ message: string }>('/api/scan', { method: 'POST', body: JSON.stringify(options) });
    setData((prev) => (prev ? { ...prev, sync: { ...prev.sync, running: true } } : prev));
    return res.message;
  }, []);

  const updateApplication = useCallback(async (id: string, patch: Partial<Pick<Application, 'status' | 'notes'>>) => {
    const before = data;
    if (before) commit({ ...before, applications: before.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    try {
      await api(`/api/applications/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    } catch (e) {
      if (before) commit(before);
      throw e;
    }
  }, [data, commit]);

  const deleteApplication = useCallback(async (id: string) => {
    const before = data;
    if (before) commit({ ...before, applications: before.applications.filter((a) => a.id !== id) });
    try {
      await api(`/api/applications/${id}`, { method: 'DELETE' });
    } catch (e) {
      if (before) commit(before);
      throw e;
    }
  }, [data, commit]);

  const updateOpportunity = useCallback(async (id: string, status: Opportunity['status']) => {
    const before = data;
    if (before) {
      const opportunities = status === 'dismissed'
        ? before.opportunities.filter((o) => o.id !== id)
        : before.opportunities.map((o) => (o.id === id ? { ...o, status } : o));
      commit({ ...before, opportunities });
    }
    try {
      await api(`/api/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    } catch (e) {
      if (before) commit(before);
      throw e;
    }
  }, [data, commit]);

  return { data, savedAt, loading, error, online, refresh, startSync, updateApplication, deleteApplication, updateOpportunity };
}

export type AppData = ReturnType<typeof useAppData>;
