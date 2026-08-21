import Link from 'next/link';

// Refractive breadcrumb for the navbar. The whole pill is a glass surface, so
// the dotted background bends through it (real lensing at the rounded edges).

export interface Crumb {
  label: string;
  href?: string;    // link target
  current?: boolean; // the page you're on — rendered bold, not a link
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="hidden sm:block">
      <ol
        className="glass-pill interactive flex items-center gap-1.5 px-3 py-1.5 m-0 list-none"
        style={{ fontSize: 12 }}
      >
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.current || !item.href ? (
                <span
                  className={item.current ? 't-text font-semibold' : 't-muted font-medium'}
                  aria-current={item.current ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="t-muted hover:[color:var(--text)] transition-colors font-medium"
                >
                  {item.label}
                </Link>
              )}
              {!isLast && (
                <span aria-hidden className="t-faint" style={{ fontSize: 10 }}>
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
