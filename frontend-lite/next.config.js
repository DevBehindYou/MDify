/** @type {import('next').NextConfig} */

// Vercel deployment: set BACKEND_URL env var in Vercel dashboard
// → https://mdify-api.onrender.com
// Local: set BACKEND_URL=http://localhost:8000 in .env.local

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  env: {
    // Exposed to client-side for the direct wake-up ping
    NEXT_PUBLIC_BACKEND_URL: BACKEND_URL,
  },

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
