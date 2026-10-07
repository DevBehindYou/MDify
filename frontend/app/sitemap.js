import { CONTENT_UPDATED, SITE_URL } from '../lib/siteContent.js';
import POSTS from '../lib/blogPosts.generated.json' with { type: 'json' };
import { LEGAL_VERSION } from '../lib/legal/policies.js';

export default function sitemap() {
  return [
    { url: SITE_URL, lastModified: CONTENT_UPDATED, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/usecase`, lastModified: CONTENT_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: LEGAL_VERSION, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/blog`, lastModified: POSTS[0]?.publishedAt || CONTENT_UPDATED, changeFrequency: 'weekly', priority: 0.7 },
    ...POSTS.map(post => ({ url: `${SITE_URL}/blog/${post.id}`, lastModified: post.publishedAt, changeFrequency: 'monthly', priority: 0.6 })),
    { url: `${SITE_URL}/terms`, lastModified: LEGAL_VERSION, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
