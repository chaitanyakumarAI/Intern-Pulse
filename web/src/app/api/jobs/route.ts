import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

function extractProp(page: any, name: string, type: string): any {
  const prop = page.properties?.[name];
  if (!prop) return null;
  switch (type) {
    case 'title':   return prop.title?.[0]?.plain_text ?? null;
    case 'rich_text': return prop.rich_text?.[0]?.plain_text ?? null;
    case 'select':  return prop.select?.name ?? null;
    case 'date':    return prop.date?.start ?? null;
    case 'url':     return prop.url ?? null;
    default:        return null;
  }
}

export async function GET() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    // Return rich mock data when env vars are not configured
    return NextResponse.json({ jobs: getMockData(), isMock: true });
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: process.env.NOTION_DATABASE_ID!,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 100,
    });

    const jobs = response.results.map((page: any) => ({
      id: page.id,
      company:    extractProp(page, 'Company', 'title') ?? extractProp(page, 'company', 'title') ?? 'Unknown',
      role:       extractProp(page, 'Role', 'rich_text') ?? extractProp(page, 'role', 'rich_text') ?? 'Unknown',
      status:     extractProp(page, 'Status', 'select') ?? 'Applied',
      platform:   extractProp(page, 'Platform', 'select') ?? 'Unknown',
      date:       extractProp(page, 'Date Applied', 'date') ?? page.created_time?.split('T')[0] ?? '',
      oa_link:    extractProp(page, 'OA Link', 'url'),
      scam_risk:  extractProp(page, 'Scam Risk', 'select') ?? 'Unknown',
      risk_notes: extractProp(page, 'Risk Notes', 'rich_text') ?? '',
      prep_sheet: extractProp(page, 'Prep Sheet', 'rich_text') ?? '',
    }));

    return NextResponse.json({ jobs, isMock: false });
  } catch (err: any) {
    console.error('Notion API error:', err.message);
    return NextResponse.json({ jobs: getMockData(), isMock: true, error: err.message });
  }
}

function getMockData() {
  return [
    { id: '1', company: 'Google DeepMind',   role: 'ML Research Intern',        status: 'Interview Scheduled', platform: 'Direct Email',  date: '2026-05-14', scam_risk: 'Low',    risk_notes: 'Well-established AI research division of Google.', prep_sheet: '• Tech Stack: Python, JAX, TensorFlow\n• Recent News: Gemini 2.5 Pro release\n• Likely Questions: Backpropagation, Transformers, System Design', oa_link: null },
    { id: '2', company: 'Walmart',            role: 'Grad Intern - No Experience', status: 'Applied',           platform: 'Company Portal', date: '2026-05-15', scam_risk: 'Low',    risk_notes: 'One of the largest retailers globally. Highly legitimate.', prep_sheet: '', oa_link: null },
    { id: '3', company: 'People Tech Group', role: 'AI Engineer',                status: 'Job Opportunity',     platform: 'Internshala',   date: '2026-05-16', scam_risk: 'Medium', risk_notes: 'Mid-size IT services firm. Generally legitimate but some reddit users report slow hiring process.', prep_sheet: '', oa_link: null },
    { id: '4', company: 'Firstsource',       role: 'Generative AI Engineer',     status: 'Job Opportunity',     platform: 'Internshala',   date: '2026-05-16', scam_risk: 'Low',    risk_notes: 'BPO listed on NSE. Legitimate but review role requirements carefully.', prep_sheet: '', oa_link: null },
    { id: '5', company: 'IQVIA',             role: 'Global Data Analyst',        status: 'OA Sent',             platform: 'LinkedIn',      date: '2026-05-10', scam_risk: 'Low',    risk_notes: 'NASDAQ-listed global healthcare data company.', prep_sheet: '', oa_link: 'https://hackerrank.com' },
    { id: '6', company: 'Tiger Analytics',  role: 'Data Science Intern',        status: 'Under Review',        platform: 'LinkedIn',      date: '2026-05-08', scam_risk: 'Low',    risk_notes: 'Analytics consulting firm. Known for data science work.', prep_sheet: '', oa_link: null },
    { id: '7', company: 'Zenotalent',        role: 'Full Stack Developer Intern', status: 'Rejected',           platform: 'Internshala',   date: '2026-05-01', scam_risk: 'High',   risk_notes: 'Multiple Reddit users report this company asks for training fees after selection. Exercise caution.', prep_sheet: '', oa_link: null },
    { id: '8', company: 'EXL',               role: 'Analytics Consultant',       status: 'Applied',             platform: 'Internshala',   date: '2026-05-03', scam_risk: 'Low',    risk_notes: 'NYSE-listed analytics and outsourcing company.', prep_sheet: '', oa_link: null },
    { id: '9', company: 'BluCognition',      role: 'Analyst - Data Science',     status: 'Offer',               platform: 'Internshala',   date: '2026-04-28', scam_risk: 'Low',    risk_notes: 'Small AI startup. Appears legitimate based on LinkedIn presence.', prep_sheet: '', oa_link: null },
  ];
}
