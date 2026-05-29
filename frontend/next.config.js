/** @type {import('next').NextConfig} */

// In production (Render), BACKEND_URL is set to the internal/external backend service URL.
// e.g. https://markitdown-backend.onrender.com
// Locally it falls back to http://localhost:8000
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

const nextConfig = {
  env: {
    BACKEND_URL,
  },
  async rewrites() {
    return [
      {
        source: '/api/health',
        destination: `${BACKEND_URL}/health`,
      },
    ];
  },
};

module.exports = nextConfig;
