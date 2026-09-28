import { bulkAction } from '../../../../lib/server/adminService';
import { adminJson, readJson, withAdmin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // deleting many jobs' files can take a while

/** { action, job_ids: [...], hours? } */
export const POST = withAdmin(
  async ({ request, db, session }) => {
    const body = await readJson(request, 64 * 1024);
    return adminJson(await bulkAction(db, session, body.job_ids, String(body.action || ''), { hours: body.hours }));
  },
  { mutation: true, name: 'bulk' }
);
