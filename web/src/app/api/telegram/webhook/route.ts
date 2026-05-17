import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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
      parse_mode: 'HTML'
    })
  });
}

// Find a job in Notion by fuzzy company name matching
async function findJobByCompany(companyName: string) {
  if (!process.env.NOTION_DATABASE_ID) return null;
  
  const response = await notion.dataSources.query({
    data_source_id: process.env.NOTION_DATABASE_ID,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    page_size: 20 // Check recent jobs
  });

  const searchStr = companyName.toLowerCase();
  
  for (const page of response.results as any[]) {
    const titleProp = page.properties['Company']?.title?.[0]?.plain_text || 
                      page.properties['company']?.title?.[0]?.plain_text || '';
    if (titleProp.toLowerCase().includes(searchStr)) {
      return { id: page.id, company: titleProp, currentStatus: page.properties['Status']?.select?.name };
    }
  }
  return null;
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

    // Command: /status [Company] [New Status]
    // Example: /status Google Offer
    if (text.startsWith('/status')) {
      const parts = text.replace('/status', '').trim().split(' ');
      if (parts.length < 2) {
        await sendTelegramMessage(chatId, "⚠️ Usage: <code>/status [Company] [Status]</code>\nExample: <code>/status Walmart Interview</code>");
        return NextResponse.json({ ok: true });
      }

      // The last word is the status, everything before is the company
      const statusInput = parts.pop()!;
      const companyInput = parts.join(' ');

      // Map common status abbreviations
      const statusMap: Record<string, string> = {
        'applied': 'Applied',
        'review': 'Under Review',
        'oa': 'OA Sent',
        'interview': 'Interview Scheduled',
        'offer': 'Offer',
        'rejected': 'Rejected'
      };
      
      const newStatus = statusMap[statusInput.toLowerCase()] || statusInput;

      await sendTelegramMessage(chatId, `🔍 Searching for <b>${companyInput}</b>...`);
      
      const job = await findJobByCompany(companyInput);
      if (!job) {
        await sendTelegramMessage(chatId, `❌ Could not find a recent application for <b>${companyInput}</b>.`);
        return NextResponse.json({ ok: true });
      }

      // Update Notion
      await notion.pages.update({
        page_id: job.id,
        properties: {
          'Status': { select: { name: newStatus } }
        }
      });

      await sendTelegramMessage(chatId, `✅ <b>Success!</b>\nMoved <b>${job.company}</b> to <code>${newStatus}</code>.`);
    } else {
      await sendTelegramMessage(chatId, "👋 Welcome to Intern Pulse Bot.\nCommands available:\n<code>/status [Company] [Status]</code> - Update an application");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Telegram Webhook Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
