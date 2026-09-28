import React from 'react';
import { LEGAL_UPDATED_LABEL, OPERATOR } from '../lib/legal/policies';

/** Plain text with the operator's email address turned into a mailto link. */
function withEmailLink(text) {
  const parts = text.split(OPERATOR.email);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <a key={i} href={`mailto:${OPERATOR.email}`} className="text-[var(--text)] underline underline-offset-2">
            {OPERATOR.email}
          </a>,
          part,
        ]
  );
}

/**
 * Renders one legal document (see lib/legal/policies.js). Presentational
 * only, so both the dialog (client) and the /privacy, /terms pages (server)
 * use it.
 */
export default function LegalDocument({ doc, headingLevel = 'h3' }) {
  const Heading = headingLevel;
  return (
    <div className="space-y-4 font-sans text-[12.5px] leading-relaxed text-[var(--muted)]">
      <div className="font-tech text-[10px] text-[var(--faint)]">Last updated {LEGAL_UPDATED_LABEL}</div>

      <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--surface-2)] space-y-1">
        <div className="font-tech uppercase tracking-wider text-[9.5px] text-[var(--faint)]">In short</div>
        <ul className="m-0 pl-4 space-y-0.5 text-[var(--text)]">
          {doc.summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <nav aria-label={`${doc.title} sections`} className="font-tech text-[11px] flex flex-wrap gap-x-3 gap-y-1">
        {doc.sections.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="text-[var(--muted)] hover:text-[var(--text)] underline-offset-2 hover:underline">
            {s.title}
          </a>
        ))}
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-4">
          <Heading id={`${s.id}-title`} className="font-wireframe text-[16px] font-bold text-[var(--text)] m-0 mb-1">
            {s.title}
          </Heading>
          {s.blocks.map((b, i) =>
            b.ul ? (
              <ul key={i} className="m-0 mb-2 pl-5 list-disc space-y-1">
                {b.ul.map((item) => (
                  <li key={item} className="[overflow-wrap:anywhere]">{withEmailLink(item)}</li>
                ))}
              </ul>
            ) : (
              <p key={i} className="m-0 mb-2 [overflow-wrap:anywhere]">
                {withEmailLink(b.p || b.note)}
              </p>
            )
          )}
        </section>
      ))}
    </div>
  );
}
