import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createSupabase, supabaseConfig } from '../../../../lib/server/supabaseRest';
import { runTick } from '../../../../lib/server/jobQueue';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Vercel Hobby maximum

function authorized(request) {
  const expected = process.env.CRON_SECRET || '';
  const given = request.headers.get('x-mdify-cron-secret') || '';
  if (!expected || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

// Background sweep, called by Supabase Cron every minute (supabase/cron.sql):
// retires stale jobs, requeues expired leases and runs one scheduling pass
// across all jobs, so work continues when nobody's browser is waiting.
export async function POST(request) {
  const config = supabaseConfig();
  const secret = process.env.BACKEND_SHARED_SECRET;
  if (!config || !secret || !process.env.CRON_SECRET) {
    return NextResponse.json({ detail: 'Background jobs are not configured' }, { status: 501 });
  }
  if (!authorized(request)) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });

  const db = createSupabase(config);
  try {
    await db.rpc('prune_public_admission', {});
    const stale = await db.rpc('sweep_stale_jobs', {});
    const { claimed, results } = await runTick(db, { secret });
    return NextResponse.json({
      stale: Array.isArray(stale) ? stale.length : 0,
      claimed,
      outcomes: results.reduce((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] || 0) + 1 }), {}),
    });
  } catch (err) {
    console.error('[jobs/tick]', err.message);
    return NextResponse.json({ detail: 'Tick failed' }, { status: 502 });
  }
}
