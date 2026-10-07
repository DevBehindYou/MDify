import Link from 'next/link';
export default function BlogLayout({ children }) {
  return <main className="min-h-screen bg-[var(--bg)] text-[var(--text)] px-4 py-8">
    <div className="max-w-3xl mx-auto">
      <nav aria-label="Blog navigation" className="flex gap-6 mb-8 border-b border-[var(--border)] pb-4">
        <Link href="/">MDify converter</Link><Link href="/blog">Blog</Link><Link href="/usecase">Why Markdown</Link>
      </nav>{children}
    </div>
  </main>;
}
