import { NextResponse } from 'next/server';
import { db, dbJson, isDbConfigured } from '@/lib/db';
import { cloudSyncInfo } from '@/lib/server-state';
import { workerFetch } from '@/lib/worker';
import { ACTIVE_STATUSES, type Application } from '@/lib/types';

// Room for a Render free-tier cold start when /scan wakes the worker.
export const maxDuration = 60;

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-internship-tracker.vercel.app';

/** Words people type after /status, mapped to stored statuses (longest phrases first). */
const STATUS_WORDS: [string, string][] = [
  ['interview scheduled', 'Interview Scheduled'], ['under review', 'Under Review'], ['needs review', 'Needs Review'],
  ['oa sent', 'OA Sent'], ['interview', 'Interview Scheduled'], ['round', 'Interview Scheduled'],
  ['assessment', 'OA Sent'], ['test', 'OA Sent'], ['oa', 'OA Sent'], ['review', 'Under Review'],
  ['reviewing', 'Under Review'], ['applied', 'Applied'], ['offer', 'Offer'], ['offered', 'Offer'],
  ['rejected', 'Rejected'], ['reject', 'Rejected'], ['ghosted', 'Ghosted'],
];

const EMOJI: Record<string, string> = {
  Applied: '📝', 'Under Review': '🔍', 'OA Sent': '💻', 'Interview Scheduled': '🎯',
  Offer: '🎉', Rejected: '❌', Ghosted: '👻', 'Needs Review': '⚠️',
};

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function reply(chatId: number, text: string) {
  if (!TELEGRAM_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

async function applications(): Promise<Application[]> {
  if (!isDbConfigured()) return [];
  return dbJson<Application[]>('applications?select=id,company,role,status,applied_date,interview_date,application_link&order=last_checked.desc.nullslast');
}

function findCompany(apps: Application[], query: string): Application | undefined {
  const q = query.toLowerCase().trim();
  return apps.find((a) => a.company.toLowerCase() === q) ?? apps.find((a) => a.company.toLowerCase().includes(q) || q.includes(a.company.toLowerCase()));
}

function parseStatusCommand(args: string): { company: string; status: string } | null {
  const lower = args.toLowerCase().trim();
  for (const [word, status] of STATUS_WORDS) {
    if (lower.endsWith(` ${word}`)) return { company: args.slice(0, args.length - word.length).trim(), status };
  }
  return null;
}

async function handle(chatId: number, command: string, args: string) {
  switch (command) {
    case '/start':
    case '/help':
      return reply(chatId,
        '⚡ <b>InternPulse</b>\n\n' +
        '/today — what needs action now\n' +
        '/list [n] — recent applications\n' +
        '/stats — pipeline numbers\n' +
        '/status &lt;company&gt; &lt;stage&gt; — e.g. <code>/status Google interview</code>\n' +
        '/scan — sync Gmail now\n' +
        '/quota — syncs left today\n' +
        '/web — open the app');

    case '/today': {
      const apps = await applications();
      const interviews = apps.filter((a) => a.status === 'Interview Scheduled');
      const tests = apps.filter((a) => a.status === 'OA Sent');
      const review = apps.filter((a) => a.status === 'Needs Review').length;
      const lines = ['📅 <b>Today</b>\n'];
      if (interviews.length) lines.push(`🎯 <b>Interviews</b>\n${interviews.map((a) => `• ${esc(a.company)}${a.interview_date ? ` — ${new Date(a.interview_date).toUTCString().slice(0, 22)} UTC` : ''}`).join('\n')}\n`);
      if (tests.length) lines.push(`💻 <b>Assessments</b>\n${tests.map((a) => `• ${esc(a.company)}${a.application_link ? ` — <a href="${esc(a.application_link)}">open</a>` : ''}`).join('\n')}\n`);
      if (review) lines.push(`⚠️ ${review} application(s) need review in the app.`);
      if (lines.length === 1) lines.push('Nothing needs action right now. ✨');
      return reply(chatId, lines.join('\n'));
    }

    case '/list': {
      const limit = Math.min(Math.max(parseInt(args, 10) || 8, 1), 20);
      const apps = (await applications()).slice(0, limit);
      if (!apps.length) return reply(chatId, '📋 No applications yet.');
      return reply(chatId, [`📋 <b>Latest ${apps.length}</b>\n`,
        ...apps.map((a, i) => `${i + 1}. ${EMOJI[a.status] ?? '📌'} <b>${esc(a.company)}</b> — ${esc(a.role)}\n    <code>${esc(a.status)}</code>`)].join('\n'));
    }

    case '/stats': {
      const apps = await applications();
      const count = (s: string) => apps.filter((a) => a.status === s).length;
      const active = apps.filter((a) => ACTIVE_STATUSES.has(a.status)).length;
      const responded = apps.filter((a) => !['Applied', 'Needs Review', 'Ghosted'].includes(a.status)).length;
      const rate = apps.length ? Math.round((responded / apps.length) * 100) : 0;
      return reply(chatId,
        `📊 <b>Pipeline</b>\n\nTracked: <b>${apps.length}</b> · Active: <b>${active}</b>\n` +
        `🎯 Interviews: ${count('Interview Scheduled')} · 💻 Tests: ${count('OA Sent')}\n` +
        `🎉 Offers: ${count('Offer')} · ❌ Rejected: ${count('Rejected')}\n` +
        `⚠️ Needs review: ${count('Needs Review')}\n\nResponse rate: <b>${rate}%</b>`);
    }

    case '/status': {
      const parsed = parseStatusCommand(args);
      if (!parsed?.company) return reply(chatId, 'Usage: <code>/status Google interview</code>');
      const app = findCompany(await applications(), parsed.company);
      if (!app) return reply(chatId, `❌ No application found for <b>${esc(parsed.company)}</b>. Try /list.`);
      await db(`applications?id=eq.${app.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: parsed.status, last_checked: new Date().toISOString() }),
      });
      return reply(chatId, `${EMOJI[parsed.status] ?? '✅'} <b>${esc(app.company)}</b>: <s>${esc(app.status)}</s> → <b>${esc(parsed.status)}</b>`);
    }

    case '/scan': {
      const sync = await cloudSyncInfo().catch(() => null);
      if (sync?.running) return reply(chatId, '⏳ A sync is already running.');
      if (sync?.quota && sync.quota.remaining <= 0) return reply(chatId, `⏱️ Daily limit reached (${sync.quota.limit}). Resets at 00:00 UTC.`);
      try {
        const res = await workerFetch('/api/sync?trigger=telegram', { method: 'POST' });
        return reply(chatId, res.ok ? '🔄 Sync started. You will get alerts for anything new.' : `⚠️ The sync worker returned ${res.status}.`);
      } catch (err) {
        return reply(chatId, `❌ Could not reach the sync worker: ${esc(err instanceof Error ? err.message : err)}`);
      }
    }

    case '/quota': {
      const sync = await cloudSyncInfo().catch(() => null);
      if (!sync?.quota) return reply(chatId, '⏱️ Quota unavailable (run supabase_schema.sql to enable sync history).');
      const last = sync.lastRun ? `\nLast sync: ${new Date(sync.lastRun.started_at).toUTCString().slice(0, 22)} UTC (${sync.lastRun.status})` : '';
      return reply(chatId, `⏱️ Syncs today: <b>${sync.quota.used}/${sync.quota.limit}</b>${last}`);
    }

    case '/web':
      return reply(chatId, `📱 ${APP_URL}`);

    default:
      return reply(chatId, 'Unknown command. Send /help.');
  }
}

export async function POST(req: Request) {
  try {
    // Only Telegram knows the secret registered with setWebhook (secret_token).
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (webhookSecret && req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await req.json();
    const text: string | undefined = update?.message?.text;
    const chatId: number | undefined = update?.message?.chat?.id;
    if (!text || chatId == null) return NextResponse.json({ ok: true });

    // Owner-only bot: fail closed if the owner's chat ID isn't configured.
    const owner = process.env.TELEGRAM_CHAT_ID;
    if (!owner || owner.startsWith('your_')) {
      console.error('TELEGRAM_CHAT_ID is not set; ignoring Telegram command.');
      return NextResponse.json({ ok: true });
    }
    if (String(chatId) !== owner) {
      await reply(chatId, '⛔ This bot is private.');
      return NextResponse.json({ ok: true });
    }

    const trimmed = text.trim();
    const command = (trimmed.split(/\s+/)[0] || '').toLowerCase().split('@')[0];
    await handle(chatId, command, trimmed.slice(trimmed.split(/\s+/)[0].length).trim());
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    // 200 so Telegram doesn't retry the same failing update forever.
    return NextResponse.json({ ok: false });
  }
}
