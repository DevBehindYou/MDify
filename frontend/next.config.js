/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    // Redirect public pages on the former production host. Keep API clients,
    // controller access and protected preview origins on their own host.
    return ['/', '/usecase', '/privacy', '/terms', '/blog/:path*', '/sitemap.xml', '/robots.txt', '/llms.txt'].map(source => ({
      source, has: [{ type: 'host', value: 'mdify-app.vercel.app' }],
      destination: 'https://mdify.devbehindyou.com' + source, permanent: true,
    }));
  },
};
module.exports = nextConfig;
