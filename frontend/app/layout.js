import { Inter, JetBrains_Mono, Patrick_Hand } from 'next/font/google';
import './globals.css';
import ConsentBanner from '../components/ConsentBanner';
import WakeOnOpen from '../components/WakeOnOpen';
import JsonLd from '../components/JsonLd';
import { DESCRIPTION, KEYWORDS, SITE_NAME, SITE_URL, TAGLINE, siteJsonLd } from '../lib/siteContent';

// next/font downloads these at build time and serves them from our own
// origin, so visitors' browsers never contact Google's font servers (GDPR).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
const patrickHand = Patrick_Hand({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-patrick-hand',
  display: 'swap',
});
const fontVariables = `${inter.variable} ${jetbrainsMono.variable} ${patrickHand.variable}`;

const BASE_URL = SITE_URL;

export const metadata = {
  metadataBase: new URL(BASE_URL),
  applicationName: SITE_NAME,

  // ── Core ───────────────────────────────────────────────────────────────────
  title: {
    default: 'MDify: Free PDF to Markdown Converter Online',
    template: '%s | MDify',
  },
  description: DESCRIPTION,
  keywords: KEYWORDS,
  authors: [{ name: 'DevBehindYou', url: 'https://github.com/DevBehindYou' }],
  creator: 'DevBehindYou',
  publisher: 'DevBehindYou',
  category: 'Productivity',

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
    canonical: '/',
  },

  // ── Icons ──────────────────────────────────────────────────────────────────
  // Both favicons are always in <head>. The inline theme script and
  // themeRepository.applyTheme switch them with `media`, never `href`: React
  // tracks these links by href and would insert a duplicate if it changed.
  icons: {
    icon: [
      { url: '/mdify-icon-dark.svg', type: 'image/svg+xml', media: 'all' },
      { url: '/mdify-icon-light.svg', type: 'image/svg+xml', media: 'not all' },
    ],
    apple: '/mdify-icon.png',
  },

  // ── Open Graph (Facebook, LinkedIn, Discord, WhatsApp, Slack) ─────────────
  openGraph: {
    title: `MDify: ${TAGLINE}`,
    description:
      'Free PDF to Markdown converter. PDF, Word, PowerPoint, Excel, HTML, images and ZIP files become clean Markdown that AI reads with 70% fewer tokens. No sign-up.',
    url: BASE_URL,
    siteName: SITE_NAME,
    images: [
      {
        url: '/og-card.png', // 1200×630
        width: 1200,
        height: 630,
        alt: `MDify, free PDF to Markdown converter. ${TAGLINE}.`,
        type: 'image/png',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },

  // ── Twitter / X ────────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    title: `MDify: ${TAGLINE}`,
    description: 'Turn PDF, Word, Excel, slides, images and ZIP files into clean Markdown. 70% fewer AI tokens. Free, no sign-up.',
    images: ['/og-card.png'],
    creator: '@DevBehindYou',
    site: '@DevBehindYou',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full ${fontVariables}`} data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before paint (default dark), then point the
            favicon at the matching icon once the head links exist. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var d=document,t='dark';try{var s=localStorage.getItem('mdify-theme');if(s==='light'||s==='dark')t=s;}catch(e){}d.documentElement.dataset.theme=t;function f(){d.querySelectorAll('link[rel=\"icon\"][href$=\".svg\"]').forEach(function(l){l.media=l.getAttribute('href').indexOf('-'+t+'.svg')>-1?'all':'not all';});}if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',f);else f();})();",
          }}
        />
      </head>
      <body className="h-full">
        <JsonLd data={siteJsonLd()} />
        {children}
        <ConsentBanner />
        <WakeOnOpen />
      </body>
    </html>
  );
}
