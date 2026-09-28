'use client';

import { Analytics } from '@vercel/analytics/next';

// Page views are counted by the host's cookie-free web analytics (Privacy
// Policy §2–4). The admin area is never counted, and query strings and
// fragments are dropped so no parameter ever leaves the page.
const IGNORED_PATHS = ['/mdify-controller'];

function beforeSend(event) {
  const url = new URL(event.url);
  if (IGNORED_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return null;
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

/** Mounted once in the root layout. Renders only the analytics script. */
export default function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />;
}
