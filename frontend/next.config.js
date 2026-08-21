/** @type {import('next').NextConfig} */

// BACKEND_URL is read at BUILD time from the host's environment variables.
// Local:  set BACKEND_URL=http://localhost:8000 in frontend/.env.local
// Vercel: set BACKEND_URL=https://mdify-pro-api.onrender.com in project env
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,

  // Expose the backend origin to the browser so it can fire a direct cold-start
  // wake ping at the backend (bypassing this proxy). Only the origin is public.
  env: {
    NEXT_PUBLIC_BACKEND_URL: BACKEND_URL,
  },

  // ── Reverse-proxy the versioned backend endpoints through Next.js ─────────
  // Rewrites forward the ENTIRE request (method, headers, body), which supports
  // multipart/form-data uploads with no body-size limit and no custom route code.
  async rewrites() {
    return [
      { source: '/api/health', destination: `${BACKEND_URL}/api/v1/health` },
      { source: '/api/convert', destination: `${BACKEND_URL}/api/v1/convert` },
    ];
  },
};

module.exports = nextConfig;
