import { SITE_URL } from '../../lib/siteContent';
import LegalPage from '../../components/LegalPage';
import { TERMS_OF_SERVICE } from '../../lib/legal/policies';

export const metadata = {
  title: 'Terms of Service',
  description: 'The terms for using MDify, the free document-to-Markdown converter.',
  alternates: { canonical: '/terms' },
  openGraph: { url: SITE_URL + '/terms', type: 'website', title: 'Terms of Service', images: ['/og-card.png'] },
};

export default function TermsPage() {
  return <LegalPage doc={TERMS_OF_SERVICE} otherHref="/privacy" otherLabel="Privacy Policy" />;
}
