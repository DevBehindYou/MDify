/** @type {import('next').NextConfig} */

// BACKEND_URL is read at BUILD time from Render's environment variables.
// Never use nextConfig.env for this — that bakes the value at compile time
// and ignores any runtime env changes.
//
// Local:  set BACKEND_URL=http://localhost:8000 in frontend/.env.local
// Render: set BACKEND_URL=https://mdify-api.onrender.com in the dashboard
//         → Render injects all env vars before npm run build, so it is
//           available when the rewrite destinations are resolved.

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  // ── Reverse-proxy both backend endpoints through Next.js ──────────────────
  // Rewrites forward the ENTIRE request (method, headers, body) to the
  // destination. This supports multipart/form-data file uploads with no
  // body-size limit. No custom route.js code is needed.
  async rewrites() {
    return [
      {
        source: '/api/health',
        destination: `${BACKEND_URL}/health`,
      },
      {
        source: '/api/convert',
        destination: `${BACKEND_URL}/convert`,
      },
    ];
  },
};

module.exports = nextConfig;
