import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status', success: false }, { status: 400 });
    }

    // 1. Primary Engine: Supabase Cloud Database
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('applications')
        .update({ 
          status, 
          last_checked: new Date().toISOString() 
        })
        .eq('id', id);

      if (error) {
        console.error('Supabase update error:', error.message);
        return NextResponse.json({ error: error.message, success: false }, { status: 500 });
      }

      return NextResponse.json({ success: true, id, status, engine: 'supabase' });
    }

    // 2. Secondary Local Engine: Update data/canonical_applications.json
    try {
      const localPath = path.join(process.cwd(), 'data', 'canonical_applications.json');
      if (fs.existsSync(localPath)) {
        const raw = fs.readFileSync(localPath, 'utf-8');
        const rows = JSON.parse(raw);
        if (Array.isArray(rows)) {
          let updated = false;
          const now = new Date().toISOString();
          for (const row of rows) {
            if (String(row.id) === String(id)) {
              row.status = status;
              row.last_checked = now;
              row.updated_at = now;
              updated = true;
              break;
            }
          }
          if (updated) {
            fs.writeFileSync(localPath, JSON.stringify(rows, null, 2), 'utf-8');
            return NextResponse.json({ success: true, id, status, engine: 'local_storage' });
          }
        }
      }
    } catch (fileErr) {
      console.warn('Local update fallback skipped:', fileErr);
    }

    return NextResponse.json({ success: true, id, status, engine: 'memory' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Database update error:', message);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
