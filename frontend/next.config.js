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
  // Expose the backend URL to client-side code so the browser can send
  // a direct wake-up ping to the backend (bypassing the Next.js proxy).
  // This is what triggers Render's cold-start mechanism reliably.
  env: {
    NEXT_PUBLIC_BACKEND_URL: BACKEND_URL,
  },

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
