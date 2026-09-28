// Browser-side export helpers: single-file download, ZIP bundle, clipboard.

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadMarkdown(result) {
  if (!result) return;
  const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
  triggerDownload(blob, result.filename || 'converted.md');
}

/**
 * Gives every entry a distinct archive name, so "report.pdf" and
 * "report.docx" (both "report.md") don't overwrite each other in the ZIP.
 */
export function uniqueArchiveNames(names) {
  const used = new Set();
  return names.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : '';
    let n = 2;
    while (used.has(`${stem} (${n})${ext}`)) n += 1;
    const unique = `${stem} (${n})${ext}`;
    used.add(unique);
    return unique;
  });
}

export async function downloadMarkdownZip(results, zipName = 'mdify-converted.zip') {
  if (!results.length) return;
  // Loaded on demand: JSZip is only needed once someone exports a bundle.
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = uniqueArchiveNames(results.map((r) => r.filename || `${r.original_name}.md`));
  results.forEach((r, i) => zip.file(names[i], r.content));
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, zipName);
}

/** Resolves true when the text reached the clipboard. Never rejects. */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
