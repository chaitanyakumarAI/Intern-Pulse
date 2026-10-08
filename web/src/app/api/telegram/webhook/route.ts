import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const STATUS_MAP: Record<string, string> = {
  'applied':             'Applied',
  'app':                 'Applied',
  'under review':        'Under Review',
  'review':              'Under Review',
  'reviewing':           'Under Review',
  'oa sent':             'OA Sent',
  'oa':                  'OA Sent',
  'assessment':          'OA Sent',
  'test':                'OA Sent',
  'interview scheduled': 'Interview Scheduled',
  'interview':           'Interview Scheduled',
  'round':               'Interview Scheduled',
  'offer':               'Offer',
  'offered':             'Offer',
  'rejected':            'Rejected',
  'reject':              'Rejected',
  'job opportunity':     'Job Opportunity',
  'opportunity':         'Job Opportunity',
  'opp':                 'Job Opportunity',
  'lead':                'Job Opportunity',
};

const STATUS_EMOJI: Record<string, string> = {
  'Applied':             '📝',
  'Under Review':        '🔍',
  'OA Sent':             '💻',
  'Interview Scheduled': '🎯',
  'Offer':               '🎉',
  'Rejected':            '❌',
  'Job Opportunity':     '💼',
};

// Helper to send a message back to Telegram
async function sendTelegramMessage(chatId: number, text: string) {
  if (!TELEGRAM_TOKEN) return;
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

// Find a job by fuzzy company name matching
async function findJobByCompany(companyName: string) {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data } = await supabase
    .from('applications')
    .select('id, company, role, status')
    .order('last_checked', { ascending: false })
    .limit(50);

  if (!data) return null;
  const searchStr = companyName.toLowerCase().trim();

  // 1. Exact match
  for (const row of data) {
    if (row.company && row.company.toLowerCase().trim() === searchStr) {
      return {
        id: String(row.id),
        company: row.company,
        role: row.role || 'Candidate / Intern',
        currentStatus: row.status || 'Applied',
      };
    }
  }

  // 2. Substring match
  for (const row of data) {
    if (
      row.company &&
      (row.company.toLowerCase().includes(searchStr) || searchStr.includes(row.company.toLowerCase()))
    ) {
      return {
        id: String(row.id),
        company: row.company,
        role: row.role || 'Candidate / Intern',
        currentStatus: row.status || 'Applied',
      };
    }
  }

  return null;
}

async function fetchRecentJobs(limit = 8) {
  if (!isSupabaseConfigured || !supabase) return [];

  const { data } = await supabase
    .from('applications')
    .select('id, company, role, status, applied_date')
    .order('last_checked', { ascending: false })
    .limit(Math.min(limit, 20));

  if (!data) return [];

  return data.map((r) => ({
    id: String(r.id),
    company: r.company || 'Unknown',
    role: r.role || 'Role unspecified',
    status: r.status || 'Applied',
    date: r.applied_date ? String(r.applied_date).split('T')[0] : '',
  }));
}

async function fetchPipelineStats() {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data } = await supabase
    .from('applications')
    .select('status')
    .limit(200);

  if (!data) return null;

  const counts: Record<string, number> = {};
  for (const row of data) {
    const s = row.status || 'Applied';
    counts[s] = (counts[s] || 0) + 1;
  }

  const total = data.length;
  const applied = counts['Applied'] || 0;
  const review = counts['Under Review'] || 0;
  const oas = counts['OA Sent'] || 0;
  const interviews = counts['Interview Scheduled'] || 0;
  const offers = counts['Offer'] || 0;
  const rejected = counts['Rejected'] || 0;
  const tracked = total - (counts['Job Opportunity'] || 0);
  const responseRate = tracked > 0 ? Math.round(((tracked - applied) / tracked) * 100) : 0;

  return { total, applied, review, oas, interviews, offers, rejected, responseRate };
}

export async function POST(req: Request) {
  try {
    const update = await req.json();

    // Ignore edits or non-messages
    if (!update.message || !update.message.text) {
      return NextResponse.json({ ok: true });
    }

    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    // Optional chat authorization check
    const authChatId = process.env.TELEGRAM_CHAT_ID;
    if (authChatId && !authChatId.startsWith('your_') && String(chatId) !== authChatId) {
      await sendTelegramMessage(chatId, '⛔ <b>Unauthorized access.</b> This bot is restricted to its owner.');
      return NextResponse.json({ ok: true });
    }

    const cmdToken = text.split(/\s+/)[0]?.toLowerCase().split('@')[0] || '';
    const argsText = text.substring(cmdToken.length).trim();

    if (cmdToken === '/start' || cmdToken === '/help') {
      const helpMsg =
        '⚡ <b>InternPulse AI Bot — Command Center</b>\n\n' +
        'Here are the commands you can use:\n\n' +
        '🔍 <b>/scan</b> — Trigger an on-demand Gmail scan now\n' +
        '🌐 <b>/web</b> — Get direct links to the Web Dashboard\n' +
        '⏱️ <b>/quota</b> — Check today\'s remaining sync quota\n' +
        '📋 <b>/list [limit]</b> — View recent applications and stages\n' +
        '📊 <b>/stats</b> — View active pipeline metrics & conversion\n' +
        '🔄 <b>/status &lt;Company&gt; &lt;Status&gt;</b> — Update an application stage\n\n' +
        '<i>Examples:</i>\n' +
        '  • <code>/status Google Interview</code>\n' +
        '  • <code>/status Microsoft Offer</code>\n' +
        '  • <code>/status Amazon OA</code>\n\n' +
        '❓ <b>/help</b> — Show this command reference.';
      await sendTelegramMessage(chatId, helpMsg);
    } else if (cmdToken === '/status' || cmdToken === '/update') {
      const parts = argsText.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await sendTelegramMessage(
          chatId,
          '⚠️ <b>Usage:</b> <code>/status &lt;Company&gt; &lt;Status&gt;</code>\n\n' +
          'Examples:\n' +
          '  • <code>/status Google Interview</code>\n' +
          '  • <code>/status Microsoft Offer</code>'
        );
        return NextResponse.json({ ok: true });
      }

      let companyInput = '';
      let targetStatus = '';

      const joinedLower = parts.join(' ').toLowerCase();
      for (const [key, canon] of Object.entries(STATUS_MAP)) {
        if (joinedLower.endsWith(key)) {
          targetStatus = canon;
          const keyWordsCount = key.split(' ').length;
          companyInput = parts.slice(0, parts.length - keyWordsCount).join(' ');
          break;
        }
      }

      if (!targetStatus) {
        const lastWord = parts[parts.length - 1].toLowerCase();
        targetStatus = STATUS_MAP[lastWord] || parts[parts.length - 1];
        companyInput = parts.slice(0, -1).join(' ');
      }

      if (!companyInput) {
        await sendTelegramMessage(chatId, '⚠️ Please specify a company name. Example: <code>/status Google Offer</code>');
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(chatId, `🔍 Searching for <b>${companyInput}</b>...`);

      const job = await findJobByCompany(companyInput);
      if (!job) {
        await sendTelegramMessage(
          chatId,
          `❌ Could not find a recent application for <b>${companyInput}</b>.\n` +
          'Send <code>/list</code> to verify companies currently in your pipeline.'
        );
        return NextResponse.json({ ok: true });
      }

      // Update in Supabase
      if (isSupabaseConfigured && supabase) {
        await supabase
          .from('applications')
          .update({
            status: targetStatus,
            last_checked: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      const emoji = STATUS_EMOJI[targetStatus] || '✅';
      await sendTelegramMessage(
        chatId,
        `${emoji} <b>Application Status Updated!</b>\n\n` +
        `🏢 <b>Company:</b> ${job.company}\n` +
        (job.role ? `💼 <b>Role:</b> ${job.role}\n` : '') +
        `🔄 <b>Stage:</b> <s>${job.currentStatus || 'Applied'}</s> ➔ <b>${targetStatus}</b>\n\n` +
        '<i>Synchronized live with database.</i>'
      );
    } else if (cmdToken === '/list' || cmdToken === '/pipeline' || cmdToken === '/jobs') {
      const limit = parseInt(argsText, 10) || 8;
      const jobs = await fetchRecentJobs(limit);
      if (!jobs || jobs.length === 0) {
        await sendTelegramMessage(chatId, '📋 No applications found in database.');
        return NextResponse.json({ ok: true });
      }

      const lines = [`📋 <b>Active Applications (${jobs.length} latest):</b>\n`];
      jobs.forEach((j, i) => {
        const emoji = STATUS_EMOJI[j.status] || '📌';
        const dateStr = j.date ? ` • <i>${j.date}</i>` : '';
        lines.push(
          `${i + 1}. ${emoji} <b>${j.company}</b> — ${j.role}\n` +
          `   Stage: <code>${j.status}</code>${dateStr}`
        );
      });
      lines.push('\n<i>To change a status, use <code>/status &lt;Company&gt; &lt;Status&gt;</code></i>');
      await sendTelegramMessage(chatId, lines.join('\n'));
    } else if (cmdToken === '/stats' || cmdToken === '/metrics') {
      const stats = await fetchPipelineStats();
      if (!stats) {
        await sendTelegramMessage(chatId, '📊 Could not calculate metrics from database.');
        return NextResponse.json({ ok: true });
      }

      const msg =
        '📊 <b>Career Pipeline Velocity</b>\n\n' +
        `📥 <b>Total Applications:</b> ${stats.total}\n` +
        `📝 <b>Awaiting Review:</b> ${stats.applied}\n` +
        `🔍 <b>In Progress / Review:</b> ${stats.review}\n` +
        `💻 <b>Online Assessments:</b> ${stats.oas}\n` +
        `🎯 <b>Interviews Scheduled:</b> ${stats.interviews}\n` +
        `🎉 <b>Offers Extended:</b> ${stats.offers}\n` +
        `❌ <b>Rejections:</b> ${stats.rejected}\n\n` +
        `📈 <b>Positive Response Rate:</b> <b>${stats.responseRate}%</b>\n\n` +
        '<i>Use <code>/list</code> to see recent updates or <code>/status &lt;Co&gt; &lt;Stage&gt;</code> to advance.</i>';
      await sendTelegramMessage(chatId, msg);
    } else if (cmdToken === '/scan' || cmdToken === '/sync') {
      const workerUrl = process.env.RENDER_WORKER_URL || 'https://ai-job-tracker-worker.onrender.com';
      await sendTelegramMessage(
        chatId,
        '⚡ <b>Initiating Gmail Inbox Sync...</b>\n\n' +
        'Triggering background scan on cloud worker.\n' +
        'Parsed applications will be written to Supabase in real time.'
      );
      try {
        const resp = await fetch(`${workerUrl}/api/sync`, { method: 'POST' });
        if (!resp.ok) {
          await sendTelegramMessage(chatId, `⚠️ Cloud worker returned status ${resp.status}. Please check Render logs.`);
        }
      } catch (err) {
        await sendTelegramMessage(chatId, `❌ Failed to trigger worker: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (cmdToken === '/web' || cmdToken === '/dashboard' || cmdToken === '/hub') {
      const webUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ai-internship-tracker.vercel.app';
      await sendTelegramMessage(
        chatId,
        '🌐 <b>InternPulse Web Dashboard:</b>\n' +
        `Main: ${webUrl}\n` +
        `Pipeline: ${webUrl}/pipeline\n` +
        `Analytics Hub: ${webUrl}/hub\n\n` +
        '<i>Track your applications with 3D visuals, threat detection, and pipeline velocity.</i>'
      );
    } else if (cmdToken === '/quota' || cmdToken === '/limit') {
      const workerUrl = process.env.RENDER_WORKER_URL || 'https://ai-job-tracker-worker.onrender.com';
      try {
        const resp = await fetch(`${workerUrl}/api/quota`);
        if (resp.ok) {
          const q = await resp.json();
          await sendTelegramMessage(
            chatId,
            '⏱️ <b>Daily Sync Quota:</b>\n\n' +
            `• <b>Syncs Used Today:</b> ${q.syncs_today} / ${q.daily_limit}\n` +
            `• <b>Remaining:</b> ${q.remaining}\n` +
            `• <b>Resets At:</b> ${q.resets_at || '00:00 UTC'}`
          );
        } else {
          await sendTelegramMessage(chatId, '⏱️ Quota: 5 daily syncs allowed. Automated polling runs periodically.');
        }
      } catch {
        await sendTelegramMessage(chatId, '⏱️ Quota: Standard limit is 5 syncs/day. Automated polling is active.');
      }
    } else {
      await sendTelegramMessage(
        chatId,
        `❓ Unrecognized command: <code>${text}</code>\nSend <code>/help</code> for available commands.`
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook processing error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
