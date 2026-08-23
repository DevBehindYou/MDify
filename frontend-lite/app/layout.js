import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import MdifyProPopup from './MdifyProPopup';

const BASE_URL = 'https://mdify-lite.vercel.app';

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'MDify — Document to Markdown Converter',
    template: '%s | MDify',
  },
  description:
    'Convert PDF, Word, Excel, PowerPoint, HTML, CSV, JSON and more to clean Markdown in seconds. Cut LLM token costs by up to 70%. Powered by Microsoft MarkItDown (110K+ ★). Free, open source, no sign-up.',
  keywords: [
    'markdown converter', 'PDF to markdown', 'Word to markdown',
    'document converter', 'MarkItDown', 'Microsoft MarkItDown',
    'LLM token reduction', 'MDify',
  ],
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  robots: { index: true, follow: true },
  icons: {
    icon: '/mdify-icon.png',
    apple: '/mdify-icon.png',
  },
  openGraph: {
    title: 'MDify — Document to Markdown Converter',
    description: 'Convert any document to clean Markdown instantly. Powered by Microsoft MarkItDown.',
    url: BASE_URL,
    siteName: 'MDify',
    images: [{ url: '/og-card.png', width: 1200, height: 630, alt: 'MDify' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MDify — Document to Markdown Converter',
    description: 'Convert any document to clean Markdown. Powered by Microsoft MarkItDown.',
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
        <MdifyProPopup />
        <Analytics />
      </body>
    </html>
  );
}
