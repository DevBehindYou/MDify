import './globals.css';
import { Analytics } from '@vercel/analytics/next';

const BASE_URL = 'https://mdify-app.onrender.com';

export const metadata = {
  metadataBase: new URL(BASE_URL),

  // ── Core ───────────────────────────────────────────────────────────────────
  title: {
    default: 'MDify — Document to Markdown Converter',
    template: '%s | MDify',
  },
  description:
    'Convert PDF, Word, Excel, PowerPoint, HTML, CSV, JSON and more to clean Markdown in seconds. Cut LLM token costs by up to 70%. Powered by Microsoft MarkItDown (110K+ ★). Free, open source, no sign-up.',
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
    'MDify',
    'DevBehindYou',
  ],
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  publisher: 'DevBehindYou',
  category: 'Developer Tools',

  // ── Robots ─────────────────────────────────────────────────────────────────
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

  // ── Canonical ──────────────────────────────────────────────────────────────
  alternates: {
    canonical: BASE_URL,
  },

  // ── Icons ──────────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/mdify-icon.png', type: 'image/png' },
    ],
    apple: '/mdify-icon.png',
    shortcut: '/mdify-icon.png',
  },

  // ── Open Graph (Facebook, LinkedIn, Discord, WhatsApp, Slack) ─────────────
  openGraph: {
    title: 'MDify — Cut PDF Token Costs by 70%',
    description:
      'Convert PDF, Word, Excel, PowerPoint, HTML and more to clean Markdown in seconds. Built on Microsoft MarkItDown (110K+ GitHub Stars). Free and open source.',
    url: BASE_URL,
    siteName: 'MDify',
    images: [
      {
        url: '/og-card.png',         // 1200×630 banner — renders in all OG previewers
        width: 1200,
        height: 630,
        alt: 'MDify — Document to Markdown Converter. 70% Token Reduction. 110K+ GitHub Stars.',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // ── Twitter / X ────────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',     // shows the full 1200×630 banner on Twitter/X
    title: 'MDify — Cut PDF Token Costs by 70%',
    description:
      'Convert any document to clean Markdown in seconds. Built on Microsoft MarkItDown with 110K+ GitHub Stars. Free, no sign-up.',
    images: ['/og-card.png'],
    creator: '@DevBehindYou',
    site: '@DevBehindYou',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
