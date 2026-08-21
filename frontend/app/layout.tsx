import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';

import { GlassFilters } from '@/components/glass/GlassFilters';

// Runs before first paint so the correct theme is applied with no flash.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('mdify-theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();`;

// Single canonical origin. Override per-environment with NEXT_PUBLIC_SITE_URL.
// Keeping ONE canonical (used for metadataBase, alternates.canonical, and the
// OG url) resolves the split-authority issue the promotion doc flagged.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mdify-pro.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'MDify Pro — Document to Markdown Converter',
    template: '%s | MDify Pro',
  },
  description:
    'Convert PDF, Word, Excel, PowerPoint, HTML, CSV, JSON and more to clean, RAG-ready Markdown in seconds. Cut LLM token costs by up to 70%. Powered by Microsoft MarkItDown. Free, open source, no sign-up.',
  keywords: [
    'markdown converter',
    'PDF to markdown',
    'Word to markdown',
    'document converter',
    'MarkItDown',
    'Microsoft MarkItDown',
    'LLM token reduction',
    'RAG pipeline',
    'DOCX to markdown',
    'Excel to markdown',
    'PowerPoint to markdown',
    'free markdown tool',
    'open source converter',
    'MDify Pro',
    'DevBehindYou',
  ],
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  publisher: 'DevBehindYou',
  category: 'Developer Tools',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: { canonical: SITE_URL },
  icons: {
    icon: [{ url: '/mdify-icon.png', type: 'image/png' }],
    apple: '/mdify-icon.png',
    shortcut: '/mdify-icon.png',
  },
  openGraph: {
    title: 'MDify Pro — Cut PDF Token Costs by 70%',
    description:
      'Convert PDF, Word, Excel, PowerPoint, HTML and more to clean, RAG-ready Markdown in seconds. Built on Microsoft MarkItDown. Free and open source.',
    url: SITE_URL,
    siteName: 'MDify Pro',
    images: [
      {
        url: '/og-card.png',
        width: 1200,
        height: 630,
        alt: 'MDify Pro — Document to Markdown Converter.',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MDify Pro — Cut PDF Token Costs by 70%',
    description:
      'Convert any document to clean, RAG-ready Markdown in seconds. Built on Microsoft MarkItDown. Free, no sign-up.',
    images: ['/og-card.png'],
    creator: '@DevBehindYou',
    site: '@DevBehindYou',
  },
};

// SoftwareApplication structured data — helps search + AI answer engines
// describe the tool accurately (recommended in the promotion doc).
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MDify Pro',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  description:
    'Convert documents (PDF, Word, Excel, PowerPoint, HTML, CSV, JSON, and more) to clean, RAG-ready Markdown. Powered by Microsoft MarkItDown.',
  url: SITE_URL,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: { '@type': 'Person', name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="h-full">
        <GlassFilters />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
