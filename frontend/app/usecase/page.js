// Server component: metadata and structured data for /usecase. All
// interactive UI lives in UseCaseClient.js (client component).

import UseCaseClient from './UseCaseClient';
import JsonLd from '../../components/JsonLd';
import { SITE_URL, TAGLINE, faqJsonLd } from '../../lib/siteContent';

const DESCRIPTION =
  'Why convert PDF to Markdown for AI: a 500-word PDF page costs about 2,235 tokens, the same page as Markdown about 667. Formats, limits and FAQ for MDify.';

export const metadata = {
  title: 'Cut PDF Token Costs by 70% with Markdown',
  description: DESCRIPTION,
  alternates: {
    canonical: '/usecase',
  },
  openGraph: {
    title: `Why Markdown? ${TAGLINE}`,
    description: DESCRIPTION,
    url: `${SITE_URL}/usecase`,
    type: 'article',
    images: [
      {
        url: '/og-card.png',
        width: 1200,
        height: 630,
        alt: `MDify, free PDF to Markdown converter. ${TAGLINE}.`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `Why Markdown? ${TAGLINE}`,
    description: 'A 500-word PDF page: about 2,235 tokens. The same page as Markdown: about 667. Free converter, no sign-up.',
    images: ['/og-card.png'],
  },
};

export default function UseCasePage() {
  return (
    <>
      <JsonLd data={faqJsonLd()} />
      <UseCaseClient />
    </>
  );
}
