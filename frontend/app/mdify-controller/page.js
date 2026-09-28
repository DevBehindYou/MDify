import AdminApp from '../../components/admin/AdminApp';

// Not linked anywhere and not indexed. Access needs both admin keys; the
// data comes only from /api/admin routes that check the session.
export const metadata = {
  title: 'Controller',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = 'force-dynamic';

export default function ControllerPage() {
  return <AdminApp />;
}
