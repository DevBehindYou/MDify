import { overview } from '../../../../lib/server/adminService';
import { adminJson, withAdmin } from '../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

export const GET = withAdmin(async ({ db }) => adminJson(await overview(db)), { name: 'overview' });
