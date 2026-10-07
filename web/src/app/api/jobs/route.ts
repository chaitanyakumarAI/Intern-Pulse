import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

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

export async function GET() {
  // 1. Primary Engine: Supabase Cloud Database (~15ms latency)
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .order('last_checked', { ascending: false });

      if (error) {
        console.error('Supabase query error:', error.message);
      } else if (data && data.length > 0) {
        const jobs = data.map((row) => {
          const comp = cleanDisplayCompany(row.company);
          const scamCheck = heuristicScamCheck(comp);
          return {
            id: String(row.id),
            company: comp,
            role: row.role || 'Candidate / Intern',
            status: row.status || 'Applied',
            platform: row.platform || 'Direct Email',
            date: row.applied_date ? String(row.applied_date).split('T')[0] : '',
            oa_link: row.application_link || null,
            scam_risk: scamCheck?.scam_risk || row.scam_risk || 'Low',
            risk_notes: scamCheck?.risk_notes || row.risk_notes || '',
            prep_sheet: row.prep_sheet || '',
          };
        });

        return NextResponse.json(
          { jobs, isMock: false, engine: 'supabase' },
          {
            headers: {
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            },
          }
        );
      }
    } catch (err) {
      console.error('Supabase fetch failed:', err);
    }
  }

  // 2. Secondary Local Engine: data/canonical_applications.json
  try {
    const localPath = path.join(process.cwd(), 'data', 'canonical_applications.json');
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf-8');
      const rows = JSON.parse(raw);
      if (Array.isArray(rows) && rows.length > 0) {
          const jobs = rows.map((row) => {
            const comp = cleanDisplayCompany(row.company);
            const scamCheck = heuristicScamCheck(comp);
            return {
              id: String(row.id),
              company: comp,
              role: row.role || 'Candidate / Intern',
              status: row.status || 'Applied',
              platform: row.platform || 'Direct Email',
              date: row.applied_date ? String(row.applied_date).split('T')[0] : '',
              oa_link: row.application_link || null,
              scam_risk: scamCheck?.scam_risk || row.scam_risk || 'Low',
              risk_notes: scamCheck?.risk_notes || row.risk_notes || '',
              prep_sheet: row.prep_sheet || '',
            };
          });

          return NextResponse.json(
            { jobs, isMock: false, engine: 'local_storage' },
            {
              headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate',
              },
            }
          );
        }
      }
  } catch (fileErr) {
    console.warn('Local fallback file read failed:', fileErr);
  }

  // 3. Fallback Demo Mode
  return NextResponse.json(
    { jobs: getMockData(), isMock: true, engine: 'demo' },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
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
