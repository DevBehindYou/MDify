import { NextResponse } from 'next/server';
import { wakeBackends } from '../../../lib/server/wake';

export const dynamic = 'force-dynamic';

// Called by the browser when MDify opens. Pings every backend so sleeping
// instances start now instead of on the user's first conversion.
export async function POST() {
  const result = await wakeBackends();
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
