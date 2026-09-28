import { signFile } from '../../../../../../../lib/server/adminService';
import { adminJson, readJson, withAdmin } from '../../../../../../../lib/server/adminRoute';

export const dynamic = 'force-dynamic';

/** A short-lived signed link: { purpose: 'download' (audited) | 'preview' }. */
export const POST = withAdmin(
  async ({ request, params, db, session }) => {
    const body = await readJson(request);
    const purpose = body.purpose === 'preview' ? 'preview' : 'download';
    return adminJson(await signFile(db, session, params.id, params.fileId, { purpose }));
  },
  { mutation: true, name: 'file' }
);
