import { SITE_URL } from '../../lib/siteContent';
import LegalPage from '../../components/LegalPage';
import { PRIVACY_POLICY } from '../../lib/legal/policies';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How MDify processes, stores and deletes the files you convert (GDPR).',
  alternates: { canonical: '/privacy' },
  openGraph: { url: SITE_URL + '/privacy', type: 'website', title: 'Privacy Policy', images: ['/og-card.png'] },
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_POLICY} otherHref="/terms" otherLabel="Terms of Service" />;
}
