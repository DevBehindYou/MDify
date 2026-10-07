import Link from 'next/link';
import POSTS from '../../lib/blogPosts.generated.json';
import { SITE_URL } from '../../lib/siteContent';
export const metadata = {
  title: 'Markdown and AI Guides', description: 'MDify guides to PDF conversion, AI token costs, scanned documents and Markdown for retrieval.',
  alternates: { canonical: '/blog' }, openGraph: { url: SITE_URL + '/blog', type: 'website', title: 'The MDify Blog', images: ['/og-card.png'] },
};
export default function BlogPage() {
  return <><h1 className="text-4xl font-bold mb-4">The MDify Blog</h1><p className="mb-8">Guides to clean Markdown, document conversion and AI token costs.</p>
    <div className="grid gap-6">{POSTS.map(post => <article key={post.id} className="border border-[var(--border)] rounded-xl p-6">
      <p className="text-sm text-[var(--muted)] mb-2"><time dateTime={post.publishedAt}>{post.date}</time> · {post.readTime}</p>
      <h2 className="text-2xl font-bold mb-3"><Link className="md-link" href={'/blog/' + post.id}>{post.title}</Link></h2><p>{post.summary}</p>
    </article>)}</div></>;
}
