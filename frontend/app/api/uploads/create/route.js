import { admitPublicRequest, admissionResponse, readBoundedBody } from '../../../../lib/server/publicAdmission';
import { NextResponse } from 'next/server';
import { createSupabase, supabaseConfig } from '../../../../lib/server/supabaseRest';
import { JobError, createUpload } from '../../../../lib/server/jobService';

export const dynamic = 'force-dynamic';

// Step 1 of the Storage flow: create the job and a signed upload URL. The
// browser then uploads the file bytes straight to Supabase Storage, so large
// files never pass through this function.
export async function POST(request) {
  const config = supabaseConfig();
  if (!config) {
    // Storage not configured: the browser falls back to POST /api/convert.
    return NextResponse.json({ detail: 'Direct upload is not configured' }, { status: 501 });
  }

  try { await admitPublicRequest(request, 'upload'); }
  catch (err) { return admissionResponse(err); }

  let input;
  try {
    const bounded = await readBoundedBody(request, 8192);
    if (bounded.error) return bounded.error;
    input = JSON.parse(new TextDecoder().decode(bounded.bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid JSON body');
  } catch {
    return NextResponse.json({ detail: 'Expected a JSON body' }, { status: 400 });
  }

  try {
    const result = await createUpload(createSupabase(config), {
      filename: String(input.filename || ''),
      size: Number(input.size),
      contentType: typeof input.content_type === 'string' ? input.content_type.slice(0, 200) : null,
      profile: String(input.profile || 'Standard'),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof JobError) return NextResponse.json({ detail: err.message }, {
      status: err.status,
      headers: { 'Cache-Control': 'no-store', ...(err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {}) },
    });
    console.error('[uploads/create]', err.message);
    return NextResponse.json({ detail: 'Could not start the upload. Please retry.' }, { status: 502 });
  }
}
