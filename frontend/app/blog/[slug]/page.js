import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import POSTS from '../../../lib/blogPosts.generated.json';
import JsonLd from '../../../components/JsonLd';
import BlogVisual from '../../../components/BlogVisual';
import { articleMetadata, articleJsonLd } from '../../../lib/articleSeo.mjs';
import { safeHref } from '../../../lib/blogRender.mjs';
export const dynamicParams = false;
export function generateStaticParams() { return POSTS.map(post => ({ slug: post.id })); }
export function generateMetadata({ params }) { const post = POSTS.find(p => p.id === params.slug); return post ? articleMetadata(post) : {}; }
export default function ArticlePage({ params }) {
  const post = POSTS.find(p => p.id === params.slug); if (!post) notFound();
  return <article><JsonLd data={articleJsonLd(post)} />
    <p className="text-sm text-[var(--muted)] mb-4"><time dateTime={post.publishedAt}>{post.date}</time> · {post.readTime} · By {post.author}</p>
    <h1 className="text-4xl font-bold mb-6">{post.title}</h1>
    <p className="border border-[var(--border)] rounded-xl p-5 mb-6"><strong>TL;DR: </strong>{post.tldr}</p>
    <div className="article-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      p: ({ children }) => <div className="my-4">{children}</div>,
      a: ({ href, children }) => { const target = safeHref(href); return target ? <a className="md-link underline" href={target.href}>{children}</a> : <span>{children}</span>; },
      img: ({ src, alt, title }) => <figure className="my-6"><BlogVisual src={src} alt={alt} size={post.visuals?.[src]} />{title && <figcaption className="text-sm mt-2">{title}</figcaption>}</figure>,
    }}>{post.content}</ReactMarkdown></div>
  </article>;
}
