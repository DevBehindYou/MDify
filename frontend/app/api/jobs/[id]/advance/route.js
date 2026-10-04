import { admitPublicRequest, admissionResponse } from '../../../../../lib/server/publicAdmission';
import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '../../../../../lib/server/supabaseRest';
import { JobError, advanceJob } from '../../../../../lib/server/jobService';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Hobby maximum; see TIMEOUT_MS_BY_POOL in the dispatcher

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Called repeatedly by the browser while a multi-part job (scanned PDF,
// archive) runs: one scheduling pass for this job, then its status.
export async function POST(request, { params }) {
  const config = supabaseConfig();
  const secret = process.env.BACKEND_SHARED_SECRET;
  if (!config || !secret) {
    return NextResponse.json({ detail: 'Direct upload is not configured' }, { status: 501 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ detail: 'Unknown job' }, { status: 404 });
  }

  try {
    await admitPublicRequest(request, 'advance');
    const body = await advanceJob(createSupabase(config), params.id, { secret });
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    const denied = admissionResponse(err);
    if (denied) return denied;
    if (err instanceof JobError) return NextResponse.json({ detail: err.message }, { status: err.status });
    console.error('[jobs/advance]', err.message);
    return NextResponse.json({ detail: 'Could not check the conversion. Retrying…' }, { status: 502 });
  }
}
