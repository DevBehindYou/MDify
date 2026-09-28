import { listJobs } from '../../../../lib/server/adminService';
import { adminJson, withAdmin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(
  async ({ request, db }) => {
    const q = request.nextUrl.searchParams;
    return adminJson(
      await listJobs(db, {
        limit: q.get('limit') || 50,
        before: q.get('before'),
        beforeId: q.get('before_id'),
        status: q.get('status') || null,
        source: q.get('source') || null,
      })
    );
  },
  { name: 'jobs' }
);
