import { jobDetail } from '../../../../../lib/server/adminService';
import { adminJson, withAdmin } from '../../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async ({ params, db }) => adminJson(await jobDetail(db, params.id)), { name: 'job' });
