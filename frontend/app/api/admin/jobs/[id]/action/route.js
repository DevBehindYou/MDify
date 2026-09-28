import { runAction } from '../../../../../../lib/server/adminService';
import { adminJson, readJson, withAdmin } from '../../../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

/** { action: KEEP | EXTEND | AUTO | DELETE_NOW | DELETE_JOB | RETRY_CLEANUP, hours? } */
export const POST = withAdmin(
  async ({ request, params, db, session }) => {
    const body = await readJson(request);
    return adminJson(await runAction(db, session, params.id, String(body.action || ''), { hours: body.hours }));
  },
  { mutation: true, name: 'action' }
);
