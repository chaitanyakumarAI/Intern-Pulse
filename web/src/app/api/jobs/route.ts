import { NextResponse } from 'next/server';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const SCAM_BLOCKLIST: Record<string, string> = {
  labmentix: "Known predatory platform offering fake or paid internship cert schemes.",
  bluestock: "Frequently flagged for deceptive internship offers, charging fees, or low educational value.",
  codsoft: "Flagged for sending generic certificate-based unpaid mass internship loops.",
  octanet: "Known for mass automated unpaid internship programs with low educational value.",
  "oasis infobyte": "Mass automated certificate loop with low educational credibility.",
  letsgrowmore: "Mass-generated certificate loop involving copy-paste beginner tasks.",
  lgm: "Associated with LetsGrowMore automated certificate loops.",
  "bharat intern": "Unpaid automated task loop offering certificates without verified corporate standing.",
  motioncut: "Unpaid automated task loop with generic certificates.",
  technohacks: "Reported for certificate-selling schemes and unpaid repetitive tasks.",
  internpe: "Known generic task-loop portal offering automated certificates.",
  vaultofcodes: "Automated unpaid task loops with minimal verification.",
  zenotalent: "Reported on community forums for soliciting training fees after initial selection."
};

function heuristicScamCheck(companyName: string): { scam_risk: string; risk_notes: string } | null {
  const norm = companyName.toLowerCase().trim();
  for (const [key, val] of Object.entries(SCAM_BLOCKLIST)) {
    const regex = new RegExp(`(^|[\\s._,-])${key}([\\s._,-]|$)`, 'i');
    if (regex.test(norm) || norm.replace(/\s+/g, '') === key.replace(/\s+/g, '')) {
      return { scam_risk: 'High', risk_notes: val };
    }
  }
  return null;
}

function cleanDisplayCompany(name: string): string {
  if (!name) return 'Unknown';
  let clean = name.trim();
  clean = clean.replace(/^(?:Team\.|HR\s+|Updates\.|Em\.|Indiacampus\.|Workday\s+)/i, '');
  clean = clean.replace(/\s+(?:Human Resources|Workday Notifications|Job Alerts|Careers|Recruiting|Talent Acquisition|Recruitment|Team|HR)$/i, '');
  const lower = clean.toLowerCase();
  if (lower.includes("l'oréal") || lower.includes("l'oreal") || lower.includes("loreal")) return "L'Oréal";
  if (lower.includes("accenture")) return "Accenture";
  if (lower.includes("applied materials")) return "Applied Materials";
  if (lower.includes("bluestock")) return "Bluestock Fintech";
  if (lower.includes("ge aerospace")) return "GE Aerospace";
  if (lower.includes("electronic arts") || lower.startsWith("ea.")) return "Electronic Arts";
  if (lower.includes("jpmorgan")) return "JPMorganChase";
  if (lower.includes("csk")) return "CSK Technologies";
  if (lower === "stuti") return "Abekus";
  return clean;
}

function extractProp(page: Record<string, unknown>, name: string, type: string): string | null {
  const properties = page.properties as Record<string, Record<string, unknown>> | undefined;
  const prop = properties?.[name];
  if (!prop) return null;
  switch (type) {
    case 'title': {
      const arr = prop.title as Array<{ plain_text?: string }> | undefined;
      return arr?.[0]?.plain_text ?? null;
    }
    case 'rich_text': {
      const arr = prop.rich_text as Array<{ plain_text?: string }> | undefined;
      return arr?.[0]?.plain_text ?? null;
    }
    case 'select': {
      const sel = prop.select as { name?: string } | undefined;
      return sel?.name ?? null;
    }
    case 'date': {
      const d = prop.date as { start?: string } | undefined;
      return d?.start ?? null;
    }
    case 'url':
      return (prop.url as string) ?? null;
    default:
      return null;
  }
}

export async function GET() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    // Return rich mock data when env vars are not configured
    return NextResponse.json(
      { jobs: getMockData(), isMock: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  try {
    const response = await notion.dataSources.query({
      data_source_id: process.env.NOTION_DATABASE_ID!,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 100,
    });

    const jobs = (response.results as Array<Record<string, unknown>>).map((page) => {
      const rawCompany = extractProp(page, 'Company', 'title') ?? extractProp(page, 'company', 'title') ?? 'Unknown';
      const company = cleanDisplayCompany(rawCompany);
      const scamCheck = heuristicScamCheck(company);
      const notes = extractProp(page, 'Notes', 'rich_text') ?? '';

      let scamRisk = scamCheck?.scam_risk ?? 'Low';
      let riskNotes = scamCheck?.risk_notes ?? '';

      if (!scamCheck) {
        const riskMatch = notes.match(/\[(HIGH|MEDIUM|LOW) RISK:\s*([^\]]+)\]/i);
        if (riskMatch) {
          scamRisk = riskMatch[1].charAt(0).toUpperCase() + riskMatch[1].slice(1).toLowerCase();
          riskNotes = riskMatch[2].trim();
        }
      }

      return {
        id: (page.id as string) ?? '',
        company,
        role:       extractProp(page, 'Role', 'rich_text') ?? extractProp(page, 'role', 'rich_text') ?? 'Unknown',
        status:     extractProp(page, 'Status', 'select') ?? 'Applied',
        platform:   extractProp(page, 'Platform', 'select') ?? 'Unknown',
        date:       extractProp(page, 'Date Applied', 'date') ?? (typeof page.created_time === 'string' ? page.created_time.split('T')[0] : ''),
        oa_link:    extractProp(page, 'OA Link', 'url'),
        scam_risk:  scamRisk,
        risk_notes: riskNotes,
        prep_sheet: extractProp(page, 'Prep Sheet', 'rich_text') ?? '',
      };
    });

    return NextResponse.json(
      { jobs, isMock: false },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Notion API error:', message);
    return NextResponse.json({ jobs: getMockData(), isMock: true, error: message });
  }
}

function getMockData() {
  const rawData = [
    { id: '1', company: 'Google DeepMind',   role: 'ML Research Intern',        status: 'Interview Scheduled', platform: 'Direct Email',  date: '2026-05-14', scam_risk: 'Low',    risk_notes: 'Well-established AI research division of Google.', prep_sheet: '• Tech Stack: Python, JAX, TensorFlow\n• Recent News: Gemini 2.5 Pro release\n• Likely Questions: Backpropagation, Transformers, System Design', oa_link: null },
    { id: '2', company: 'Walmart',            role: 'Grad Intern - No Experience', status: 'Applied',           platform: 'Company Portal', date: '2026-05-15', scam_risk: 'Low',    risk_notes: 'One of the largest retailers globally. Highly legitimate.', prep_sheet: '', oa_link: null },
    { id: '3', company: 'People Tech Group', role: 'AI Engineer',                status: 'Job Opportunity',     platform: 'Internshala',   date: '2026-05-16', scam_risk: 'Medium', risk_notes: 'Mid-size IT services firm. Generally legitimate but some reddit users report slow hiring process.', prep_sheet: '', oa_link: null },
    { id: '4', company: 'Firstsource',       role: 'Generative AI Engineer',     status: 'Job Opportunity',     platform: 'Internshala',   date: '2026-05-16', scam_risk: 'Low',    risk_notes: 'BPO listed on NSE. Legitimate but review role requirements carefully.', prep_sheet: '', oa_link: null },
    { id: '5', company: 'IQVIA',             role: 'Global Data Analyst',        status: 'OA Sent',             platform: 'LinkedIn',      date: '2026-05-10', scam_risk: 'Low',    risk_notes: 'NASDAQ-listed global healthcare data company.', prep_sheet: '', oa_link: 'https://hackerrank.com' },
    { id: '6', company: 'Tiger Analytics',  role: 'Data Science Intern',        status: 'Under Review',        platform: 'LinkedIn',      date: '2026-05-08', scam_risk: 'Low',    risk_notes: 'Analytics consulting firm. Known for data science work.', prep_sheet: '', oa_link: null },
    { id: '7', company: 'Zenotalent',        role: 'Full Stack Developer Intern', status: 'Rejected',           platform: 'Internshala',   date: '2026-05-01', scam_risk: 'High',   risk_notes: 'Multiple Reddit users report this company asks for training fees after selection. Exercise caution.', prep_sheet: '', oa_link: null },
    { id: '8', company: 'EXL',               role: 'Analytics Consultant',       status: 'Applied',             platform: 'Internshala',   date: '2026-05-03', scam_risk: 'Low',    risk_notes: 'NYSE-listed analytics and outsourcing company.', prep_sheet: '', oa_link: null },
    { id: '9', company: 'BluCognition',      role: 'Analyst - Data Science',     status: 'Offer',               platform: 'Internshala',   date: '2026-04-28', scam_risk: 'Low',    risk_notes: 'Small AI startup. Appears legitimate based on LinkedIn presence.', prep_sheet: '', oa_link: null },
    { id: '10', company: 'Bluestock Fintech', role: 'Python Developer Intern',     status: 'Job Opportunity',     platform: 'Internshala',   date: '2026-05-17', scam_risk: 'High',   risk_notes: 'Frequently flagged for deceptive internship offers, charging fees, or low educational value.', prep_sheet: '', oa_link: null }
  ];

  return rawData.map(job => {
    const scamCheck = heuristicScamCheck(job.company);
    if (scamCheck) {
      return {
        ...job,
        scam_risk: scamCheck.scam_risk,
        risk_notes: scamCheck.risk_notes
      };
    }
    return job;
  });
}

