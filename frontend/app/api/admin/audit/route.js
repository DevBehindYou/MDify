import { listAudit } from '../../../../lib/server/adminService';
import { adminJson, withAdmin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async ({ request, db }) => {
    const q = request.nextUrl.searchParams;
    return adminJson(await listAudit(db, { limit: q.get('limit') || 100, before: q.get('before'), beforeId: q.get('before_id') }));
  },
  { name: 'audit' }
);
