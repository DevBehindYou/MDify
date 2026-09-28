import LegalPage from '../../components/LegalPage';
import { PRIVACY_POLICY } from '../../lib/legal/policies';

export const metadata = {
  title: 'Privacy Policy',
  description: 'How MDify processes, stores and deletes the files you convert (GDPR).',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return <LegalPage doc={PRIVACY_POLICY} otherHref="/terms" otherLabel="Terms of Service" />;
}
