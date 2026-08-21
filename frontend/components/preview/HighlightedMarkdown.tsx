// Lightweight, dependency-free Markdown syntax highlight (headings, rules,
// code, lists). Purely presentational. Colors are token-adaptive via
// color-mix so they stay legible in both the dark and light themes.

const LIST_COLOR = 'color-mix(in srgb, #38bdf8 62%, var(--text))';
const CODE_COLOR = 'color-mix(in srgb, #a78bfa 60%, var(--text))';

export function HighlightedMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <pre className="markdown-pre p-4 pb-8" style={{ color: 'var(--text)' }}>
      {lines.map((line, i) => {
        if (/^#{1,6}\s/.test(line)) {
          return (
            <span key={i} className="block font-medium" style={{ color: 'var(--accent)' }}>
              {line}
              {'\n'}
            </span>
          );
        }
        if (/^[-*]{3,}$/.test(line.trim())) {
          return (
            <span key={i} className="block my-1" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              {'\n'}
            </span>
          );
        }
        if (/^```/.test(line) || /^ {4}/.test(line)) {
          return (
            <span key={i} className="block" style={{ color: CODE_COLOR }}>
              {line}
              {'\n'}
            </span>
          );
        }
        if (/^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line)) {
          return (
            <span key={i} className="block" style={{ color: LIST_COLOR }}>
              {line}
              {'\n'}
            </span>
          );
        }
        return (
          <span key={i} className="block" style={{ color: 'var(--muted)' }}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </pre>
  );
}
