// Server component — exports metadata for /usecase SEO.
// All interactive UI lives in UseCaseClient.js (client component).

import UseCaseClient from './UseCaseClient';

export const metadata = {
  title: 'Why Use MDify?',
  description:
    'Cut PDF token costs by up to 70% with Markdown conversion. MDify is built on Microsoft MarkItDown (110K+ GitHub Stars) and converts PDF, Word, Excel, PowerPoint, HTML and 12+ formats to clean Markdown. Free, no sign-up.',
  alternates: {
    canonical: 'https://mdify-app.onrender.com/usecase',
  },
  openGraph: {
    title: 'Why Use MDify? Cut PDF Token Costs by 70%',
    description:
      'Learn why teams use MDify to convert documents to Markdown. 70% token reduction for LLM pipelines. 110K+ GitHub Stars. 12+ file formats. Free and open source.',
    url: 'https://mdify-app.onrender.com/usecase',
    images: [
      {
        url: '/og-card.png',
        width: 1200,
        height: 630,
        alt: 'MDify — Cut PDF Token Costs by 70%. Built on Microsoft MarkItDown.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Why Use MDify? Cut PDF Token Costs by 70%',
    description:
      'MDify converts 12+ file formats to clean Markdown. 70% fewer LLM tokens. Built on Microsoft MarkItDown (110K+ ★).',
    images: ['/og-card.png'],
  },
};

export default function UseCasePage() {
  return <UseCaseClient />;
}
