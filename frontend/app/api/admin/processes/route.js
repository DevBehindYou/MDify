import { processes } from '../../../../lib/server/adminService';
import { adminJson, withAdmin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async () => adminJson(await processes()), { name: 'processes' });
