// Builds the admin tree view from a job's content_nodes rows.
//
//   ARCHIVE  folders from logical_path; a nested ZIP is both a file and a
//            folder ("vendor.zip/lib/util.py" hangs under "vendor.zip")
//   PDF      page ranges in page order: text runs and OCR pages
//   other    the uploaded file alone
//
// After a job's files are deleted, paths are cleared in the database; nodes
// then show their type and position instead of a name.

const STATUS_ORDER = ['FAILED', 'SKIPPED', 'PENDING', 'RUNNING', 'DONE'];

function folder(name, path) {
  return { key: `dir:${path}`, name, path, node: null, children: new Map() };
}

/** Summary counts for a set of nodes: { total, DONE, SKIPPED, ... }. */
export function countStatuses(nodes) {
  const counts = { total: 0 };
  for (const n of nodes) {
    counts.total += 1;
    counts[n.status] = (counts[n.status] || 0) + 1;
  }
  return counts;
}

function pageLabel(n) {
  const range = n.page_from === n.page_to || n.page_to == null ? `Page ${n.page_from}` : `Pages ${n.page_from}–${n.page_to}`;
  return `${range} · ${n.classification === 'PDF_OCR' ? 'image, text recognition' : 'text'}`;
}

function toPlain(entry) {
  const children = [...entry.children.values()].map(toPlain).sort((a, b) => {
    if (a.order !== undefined || b.order !== undefined) return (a.order ?? Infinity) - (b.order ?? Infinity);
    const aDir = a.children.length > 0 && !a.node;
    const bDir = b.children.length > 0 && !b.node;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
  return { key: entry.key, name: entry.name, path: entry.path, node: entry.node, order: entry.order, children };
}

/**
 * Returns { root, counts } where root is
 * { key, name, node, children: [...] } (same shape all the way down).
 */
export function buildContentTree(nodes = [], job = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const rootNode = list.find((n) => n.node_type === 'ROOT_FILE') || null;
  const rest = list.filter((n) => n !== rootNode);
  const rootName = rootNode?.logical_path || job.original_filename || `${(job.source_type || 'file').toLowerCase()} (name removed)`;
  const root = folder(rootName, '');
  root.key = 'root';
  root.node = rootNode;

  const paged = rest.filter((n) => n.node_type === 'PDF_PAGE' || n.node_type === 'PDF_SEGMENT');
  const others = rest.filter((n) => !paged.includes(n));

  for (const n of [...paged].sort((a, b) => (a.page_from ?? 0) - (b.page_from ?? 0))) {
    root.children.set(`page:${n.node_id}`, {
      key: `node:${n.node_id}`,
      name: pageLabel(n),
      path: '',
      node: n,
      order: n.page_from ?? 0, // pages keep page order, not name order
      children: new Map(),
    });
  }

  others.forEach((n, i) => {
    if (!n.logical_path) {
      const label = `${String(n.node_type || 'ITEM').toLowerCase().replace(/_/g, ' ')} #${(n.sequence_index ?? i) + 1}`;
      root.children.set(`anon:${n.node_id}`, {
        key: `node:${n.node_id}`,
        name: label,
        path: '',
        node: n,
        order: 1_000_000 + (n.sequence_index ?? i), // after any pages, in archive order
        children: new Map(),
      });
      return;
    }
    const parts = n.logical_path.split('/').filter(Boolean);
    let at = root;
    let path = '';
    parts.forEach((part, idx) => {
      path = path ? `${path}/${part}` : part;
      if (!at.children.has(part)) at.children.set(part, folder(part, path));
      at = at.children.get(part);
      if (idx === parts.length - 1) {
        at.node = n;
        at.key = `node:${n.node_id}`;
      }
    });
  });

  return { root: toPlain(root), counts: countStatuses(rest) };
}

/** Worst status among a subtree's nodes, for folder badges. */
export function worstStatus(entry) {
  let worst = entry.node?.status || null;
  for (const child of entry.children) {
    const s = worstStatus(child);
    if (s && (!worst || STATUS_ORDER.indexOf(s) < STATUS_ORDER.indexOf(worst))) worst = s;
  }
  return worst;
}
