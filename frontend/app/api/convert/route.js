import { admitPublicRequest, admissionResponse, readBoundedBody } from '../../../lib/server/publicAdmission';
import { NextResponse } from 'next/server';
import { SUPPORTED_EXTENSIONS, maxFileSizeFor, poolForExtension, sizeLimitMessage, splitFileName } from '../../../lib/formats';
import { dispatchConversion, getPoolConfig } from '../../../lib/server/dispatcher';

// Interim transport: the browser still posts the file here and this route
// forwards it to a backend. The Storage flow (/api/uploads/create, then
// /api/jobs/:id/start) replaces it once Supabase is configured.
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Hobby maximum; see TIMEOUT_MS_BY_POOL in the dispatcher

export async function POST(request) {
  const secret = process.env.BACKEND_SHARED_SECRET;
  if (!secret) {
    console.error('BACKEND_SHARED_SECRET is not set; refusing to dispatch.');
    return NextResponse.json({ detail: 'Converter backend is not configured.' }, { status: 503 });
  }

  let admission;
  try { admission = await admitPublicRequest(request, 'convert'); }
  catch (err) { return admissionResponse(err); }
  let releaseLease = true;

  try {
    let formData;
    try {
      const bounded = await readBoundedBody(request, 16 * 1024 * 1024);
      if (bounded.error) return bounded.error;
      formData = await new Response(bounded.bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData();
    } catch {
      return NextResponse.json({ detail: 'Expected a multipart/form-data upload' }, { status: 400 });
    }

    const file = formData.get('file');
    const profile = String(formData.get('profile') || 'Standard');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ detail: 'No file provided' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ detail: 'The uploaded file is empty' }, { status: 400 });
    }
    // Cheap routing checks only — the backend re-validates the actual bytes.
    const { ext } = splitFileName(file.name);
    const pool = poolForExtension(ext);
    if (!pool) {
      return NextResponse.json(
        {
          detail: `Unsupported file format: .${ext || 'unknown'}. Supported formats: ${SUPPORTED_EXTENSIONS.join(', ')}`,
        },
        { status: 400 }
      );
    }
    if (file.size > maxFileSizeFor(ext)) {
      return NextResponse.json({ detail: sizeLimitMessage(ext) }, { status: 413 });
    }

    const jobId = crypto.randomUUID();
    releaseLease = false; // Keep the lease on an uncertain backend outcome.
    const { status, body, attempts } = await dispatchConversion({
      pool,
      urls: getPoolConfig()[pool],
      jobId,
      file,
      profile,
      secret,
    });

    releaseLease = status < 500 && attempts === 1;
    return NextResponse.json(body, { status });
  } finally { if (releaseLease) await admission.release(); }
}
