import './globals.css';

export const metadata = {
  title: 'MarkItDown — Document to Markdown',
  description:
    'Convert any document to clean Markdown using Microsoft MarkItDown. Supports PDF, Word, Excel, PowerPoint, HTML, and more.',
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
