import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '../../../../../lib/server/supabaseRest';
import { JobError, downloadUrl } from '../../../../../lib/server/jobService';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Fresh short-lived signed URL for a completed job's Markdown.
export async function GET(_request, { params }) {
  const config = supabaseConfig();
  if (!config) return NextResponse.json({ detail: 'Direct upload is not configured' }, { status: 501 });
  if (!UUID.test(params.id)) return NextResponse.json({ detail: 'Unknown job' }, { status: 404 });

  try {
    const url = await downloadUrl(createSupabase(config), params.id);
    return NextResponse.json({ download_url: url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ detail: err.message }, { status: err.status });
    console.error('[jobs/download]', err.message);
    return NextResponse.json({ detail: 'Could not create a download link' }, { status: 502 });
  }
}
