import './globals.css';
import { Analytics } from '@vercel/analytics/next';

const BASE_URL = 'https://mdify-lite.vercel.app';

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: 'MDify Lite — Instant Document to Markdown',
  description:
    'The ultra-minimal version of MDify. Drop a file, get Markdown instantly. No account. No clutter. Powered by Microsoft MarkItDown.',
  keywords: ['markdown converter', 'PDF to markdown', 'Word to markdown', 'document converter', 'MDify Lite'],
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  robots: { index: true, follow: true },
  icons: {
    icon: '/mdify-icon.png',
    apple: '/mdify-icon.png',
  },
  openGraph: {
    title: 'MDify Lite — Instant Document to Markdown',
    description: 'Drop a file. Get Markdown. Zero clutter. Powered by Microsoft MarkItDown.',
    url: BASE_URL,
    siteName: 'MDify Lite',
    images: [{ url: '/og-card.png', width: 1200, height: 630, alt: 'MDify Lite' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MDify Lite — Instant Document to Markdown',
    description: 'Drop a file. Get Markdown. Zero clutter.',
    images: ['/og-card.png'],
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
