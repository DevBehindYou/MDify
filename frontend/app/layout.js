import './globals.css';

export const metadata = {
  metadataBase: new URL('https://mdify-app.onrender.com'),
  title: 'MDify — Document to Markdown Converter',
  description:
    'Convert any document to clean, structured Markdown in seconds. Supports PDF, Word, Excel, PowerPoint, HTML, and more. Powered by Microsoft MarkItDown. Built by DevBehindYou.',
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  icons: {
    icon: '/mdify-icon.png',
    apple: '/mdify-icon.png',
  },
  openGraph: {
    title: 'MDify — Document to Markdown Converter',
    description:
      'Convert PDF, Word, Excel, PowerPoint, HTML and more to clean Markdown instantly. Free, fast, and open source.',
    url: 'https://mdify-app.onrender.com',
    siteName: 'MDify',
    images: [
      {
        url: '/mdify-icon.png',
        width: 1024,
        height: 1024,
        alt: 'MDify — Document to Markdown',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'MDify — Document to Markdown Converter',
    description: 'Convert any document to clean Markdown instantly. Powered by Microsoft MarkItDown.',
    images: ['/mdify-icon.png'],
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
      <body className="h-full">{children}</body>
    </html>
  );
}
