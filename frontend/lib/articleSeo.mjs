import { SITE_URL } from './siteContent.js';
export function articleMetadata(post) {
  const url = SITE_URL + '/blog/' + post.id;
  return { title: post.title, description: post.description || post.summary,
    alternates: { canonical: url },
    openGraph: { title: post.title, description: post.description || post.summary, url, type: 'article', publishedTime: post.publishedAt, authors: [post.author], images: ['/og-card.png'] },
    twitter: { card: 'summary_large_image', title: post.title, description: post.description || post.summary, images: ['/og-card.png'] },
  };
}
export function articleJsonLd(post) {
  const url = SITE_URL + '/blog/' + post.id;
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BlogPosting', '@id': url + '#article', headline: post.title, description: post.description || post.summary,
      url, mainEntityOfPage: url, datePublished: post.publishedAt, inLanguage: 'en',
      author: { '@type': 'Organization', name: post.author, url: 'https://devbehindyou.com' },
      publisher: { '@id': SITE_URL + '/#developer' }, image: SITE_URL + '/og-card.png', isAccessibleForFree: true },
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'MDify', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE_URL + '/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ] },
  ] };
}
