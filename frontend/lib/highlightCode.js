import Prism from 'prismjs';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-sql.js';
/**
 * Highlight code string using Prism.js with language fallback
 */
export function highlightCode(code, rawLang) {
  if (!code) return '';
  const lang = (rawLang || '').toLowerCase().trim();
  const langAliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
  };
  const target = langAliases[lang] || lang;
  const grammar = Prism.languages[target] || Prism.languages.javascript || Prism.languages.markup;
  try {
    return Prism.highlight(code, grammar, target);
  } catch {
    return null;
  }
}


