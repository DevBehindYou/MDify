import { NextResponse } from 'next/server';
import { NORMAL_EXTENSIONS, OCR_EXTENSIONS } from '../../../lib/formats';
import { getPoolConfig } from '../../../lib/server/dispatcher';
import { supabaseConfig } from '../../../lib/server/supabaseRest';

export const dynamic = 'force-dynamic';

// Reports this frontend's own health, how many backend instances it can route
// to, and whether direct Storage upload is configured. No URLs or keys.
export async function GET() {
  const pools = getPoolConfig();
  return NextResponse.json({
    status: 'ok',
    storage: supabaseConfig() !== null,
    pools: {
      normal: { instances: pools.normal.length, formats: NORMAL_EXTENSIONS },
      ocr: { instances: pools.ocr.length, formats: OCR_EXTENSIONS },
    },
  });
}
