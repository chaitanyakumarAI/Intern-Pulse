import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
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

function extractProp(page: Record<string, unknown>, name: string, type: 'title' | 'rich_text' | 'select' | 'date'): string {
  const props = page.properties as Record<string, Record<string, unknown>> | undefined;
  const p = props?.[name] ?? props?.[name.toLowerCase()];
  if (!p) return '';
  if (type === 'title') {
    const arr = p.title as Array<{ plain_text?: string }> | undefined;
    return arr?.[0]?.plain_text || '';
  }
  if (type === 'rich_text') {
    const arr = p.rich_text as Array<{ plain_text?: string }> | undefined;
    return arr?.[0]?.plain_text || '';
  }
  if (type === 'select') {
    const sel = p.select as { name?: string } | undefined;
    return sel?.name || '';
  }
  if (type === 'date') {
    const d = p.date as { start?: string } | undefined;
    return d?.start || '';
  }
  return '';
}

// Find a job in Notion by fuzzy company name matching
async function findJobByCompany(companyName: string) {
  if (!process.env.NOTION_DATABASE_ID) return null;

  const response = await notion.dataSources.query({
    data_source_id: process.env.NOTION_DATABASE_ID,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 50,
  });

  const searchStr = companyName.toLowerCase().trim();

  // 1. Exact match
  for (const page of response.results as Array<Record<string, unknown>>) {
    const titleProp = extractProp(page, 'Company', 'title');
    if (titleProp.toLowerCase().trim() === searchStr) {
      return {
        id: (page.id as string) ?? '',
        company: titleProp,
        role: extractProp(page, 'Role', 'rich_text'),
        currentStatus: extractProp(page, 'Status', 'select'),
      };
    }
  }

  // 2. Substring match
  for (const page of response.results as Array<Record<string, unknown>>) {
    const titleProp = extractProp(page, 'Company', 'title');
    if (titleProp.toLowerCase().includes(searchStr) || searchStr.includes(titleProp.toLowerCase())) {
      return {
        id: (page.id as string) ?? '',
        company: titleProp,
        role: extractProp(page, 'Role', 'rich_text'),
        currentStatus: extractProp(page, 'Status', 'select'),
      };
    }
  }

  return null;
}

async function fetchRecentJobs(limit = 8) {
  if (!process.env.NOTION_DATABASE_ID) return [];

  const response = await notion.dataSources.query({
    data_source_id: process.env.NOTION_DATABASE_ID,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: Math.min(limit, 15),
  });

  return (response.results as Array<Record<string, unknown>>).map((page) => ({
    id: (page.id as string) ?? '',
    company: extractProp(page, 'Company', 'title') || 'Unknown',
    role: extractProp(page, 'Role', 'rich_text') || 'Role unspecified',
    status: extractProp(page, 'Status', 'select') || 'Applied',
    date: extractProp(page, 'Date Applied', 'date'),
  }));
}

async function fetchPipelineStats() {
  if (!process.env.NOTION_DATABASE_ID) return null;

  const response = await notion.dataSources.query({
    data_source_id: process.env.NOTION_DATABASE_ID,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 100,
  });

  const counts: Record<string, number> = {};
  const results = response.results as Array<Record<string, unknown>>;

  for (const page of results) {
    const s = extractProp(page, 'Status', 'select') || 'Applied';
    counts[s] = (counts[s] || 0) + 1;
  }

  const total = results.length;
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
        '🔄 <b>/status &lt;Company&gt; &lt;Status&gt;</b>\n' +
        '<i>Update application stage in Notion.</i>\n' +
        'Examples:\n' +
        '  • <code>/status Google Interview</code>\n' +
        '  • <code>/status Microsoft Offer</code>\n' +
        '  • <code>/status Amazon OA</code>\n' +
        '  • <code>/status Meta Rejected</code>\n\n' +
        '📋 <b>/list [limit]</b>\n' +
        '<i>View your latest applications and stages.</i>\n\n' +
        '📊 <b>/stats</b>\n' +
        '<i>View pipeline velocity and response rate.</i>\n\n' +
        '⏱️ <b>/quota</b>\n' +
        '<i>Check daily Gmail sync quota limit.</i>\n\n' +
        '❓ <b>/help</b> — Show this command reference.';
      await sendTelegramMessage(chatId, helpMsg);
    } else if (cmdToken === '/status' || cmdToken === '/update') {
      const parts = argsText.split(/\s+/).filter(Boolean);
      if (parts.length < 2) {
        await sendTelegramMessage(
          chatId,
          '⚠️ <b>Usage:</b> <code>/status &lt;Company&gt; &lt;Status&gt;</code>\n' +
          'Example: <code>/status Google Interview</code>'
        );
        return NextResponse.json({ ok: true });
      }

      let companyInput = '';
      let targetStatus = '';

      const joinedLower = parts.join(' ').toLowerCase();
      for (const [rawKey, canon] of Object.entries(STATUS_MAP)) {
        if (joinedLower.endsWith(rawKey)) {
          targetStatus = canon;
          const suffixWordCount = rawKey.split(' ').length;
          companyInput = parts.slice(0, parts.length - suffixWordCount).join(' ');
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

      // Update Notion
      await notion.pages.update({
        page_id: job.id,
        properties: {
          'Status': { select: { name: targetStatus } },
        },
      });

      const emoji = STATUS_EMOJI[targetStatus] || '✅';
      await sendTelegramMessage(
        chatId,
        `${emoji} <b>Application Status Updated!</b>\n\n` +
        `🏢 <b>Company:</b> ${job.company}\n` +
        (job.role ? `💼 <b>Role:</b> ${job.role}\n` : '') +
        `🔄 <b>Stage:</b> <s>${job.currentStatus || 'Applied'}</s> ➔ <b>${targetStatus}</b>\n\n` +
        '<i>Synchronized live with Notion database.</i>'
      );
    } else if (cmdToken === '/list' || cmdToken === '/pipeline' || cmdToken === '/jobs') {
      const limit = parseInt(argsText, 10) || 8;
      const jobs = await fetchRecentJobs(limit);
      if (!jobs || jobs.length === 0) {
        await sendTelegramMessage(chatId, '📋 No applications found in Notion database.');
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
        await sendTelegramMessage(chatId, '📊 Could not calculate metrics from Notion.');
        return NextResponse.json({ ok: true });
      }

      const msg =
        '📊 <b>Career Pipeline Velocity</b>\n\n' +
        `📁 <b>Total Tracked:</b> ${stats.total}\n` +
        `📝 <b>Applied:</b> ${stats.applied}\n` +
        `🔍 <b>Under Review:</b> ${stats.review}\n` +
        `💻 <b>OA Assessments:</b> ${stats.oas}\n` +
        `🎯 <b>Interviews:</b> ${stats.interviews}\n` +
        `🎉 <b>Offers:</b> ${stats.offers}\n` +
        `❌ <b>Rejected:</b> ${stats.rejected}\n\n` +
        `🚀 <b>Response Rate:</b> <b>${stats.responseRate}%</b>`;
      await sendTelegramMessage(chatId, msg);
    } else if (cmdToken === '/quota' || cmdToken === '/limit') {
      const dailyLimit = parseInt(process.env.DAILY_SYNC_LIMIT || '5', 10);
      const quotaMsg =
        '⏱️ <b>Daily Gmail Sync Quota</b>\n\n' +
        `<b>Daily Limit:</b> ${dailyLimit} syncs/day\n` +
        '<b>Resets At:</b> 00:00 UTC\n\n' +
        '<i>To trigger an inbox sync, visit your InternPulse Dashboard or run the desktop engine.</i>';
      await sendTelegramMessage(chatId, quotaMsg);
    } else {
      await sendTelegramMessage(
        chatId,
        `👋 Welcome to <b>InternPulse Bot</b>.\n\n` +
        `Unrecognized command: <code>${text}</code>\n` +
        'Send <code>/help</code> to see available commands.'
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram Webhook Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
