import { SITE_URL } from '../lib/siteContent.js';

// Search engines and AI answer engines (ChatGPT, Perplexity, Claude, Gemini,
// Copilot) may read every public page. The API and the admin stay closed.
const CLOSED = ['/api/', '/mdify-controller'];

const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
];

export default function robots() {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: CLOSED },
      { userAgent: AI_CRAWLERS, allow: '/', disallow: CLOSED },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
