// Server component — exports metadata for /usecase SEO.
// All interactive UI lives in UseCaseClient.tsx (client component).

import type { Metadata } from 'next';

import UseCaseClient from './UseCaseClient';

export const metadata: Metadata = {
  title: 'Why Use MDify Pro?',
  description:
    'Cut PDF token costs by up to 70% with Markdown conversion. MDify Pro is built on Microsoft MarkItDown (110K+ GitHub Stars) and converts PDF, Word, Excel, PowerPoint, HTML and 20+ formats to clean, RAG-ready Markdown. Free, no sign-up.',
  alternates: { canonical: '/usecase' },
  openGraph: {
    title: 'Why Use MDify Pro? Cut PDF Token Costs by 70%',
    description:
      'Learn why teams use MDify Pro to convert documents to Markdown. 70% token reduction for LLM pipelines. 110K+ GitHub Stars. 20+ file formats. Free and open source.',
    url: '/usecase',
    images: [
      {
        url: '/og-card.png',
        width: 1200,
        height: 630,
        alt: 'MDify Pro — Cut PDF Token Costs by 70%. Built on Microsoft MarkItDown.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Why Use MDify Pro? Cut PDF Token Costs by 70%',
    description:
      'MDify Pro converts 20+ file formats to clean, RAG-ready Markdown. 70% fewer LLM tokens. Built on Microsoft MarkItDown (110K+ ★).',
    images: ['/og-card.png'],
  },
};

export default function UseCasePage() {
  return <UseCaseClient />;
}
