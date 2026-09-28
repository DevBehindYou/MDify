// A stand-in for createSupabase() (lib/server/supabaseRest.js) that runs the
// real migrations on PGlite. PostgREST-style calls (insert/select/update/rpc)
// become SQL, so jobService and jobQueue are tested against the shipped
// functions. Storage is a Map of object paths (listing and removal work;
// signing returns fake URLs).

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name) {
  if (!IDENT.test(name)) throw new Error(`bad identifier ${name}`);
  return name;
}

/** PostgREST filters we use: {col: 'eq.value' | 'lt.timestamp'}, select, order, limit. */
function where(filters, params) {
  const clauses = [];
  for (const [key, value] of Object.entries(filters || {})) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) continue;
    const m = /^(eq|lt)\.(.*)$/s.exec(String(value));
    if (!m) throw new Error(`unsupported filter ${key}=${value}`);
    params.push(m[2]);
    clauses.push(m[1] === 'eq' ? `${ident(key)}::text = $${params.length}` : `${ident(key)} < $${params.length}::timestamptz`);
  }
  return clauses.length ? ` where ${clauses.join(' and ')}` : '';
}

export function createPgliteSupabase(pg, { bucket = 'mdify-pro-files', calls = [], objects = new Map() } = {}) {
  const signatures = new Map();

  async function signature(fn) {
    if (!signatures.has(fn)) {
      const { rows } = await pg.query(
        `select p.proargnames as names, p.proretset as set,
                string_to_array(oidvectortypes(p.proargtypes), ', ') as types,
                t.typtype as rettype
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           join pg_type t on t.oid = p.prorettype
          where n.nspname = 'public' and p.proname = $1`,
        [fn]
      );
      if (!rows.length) throw new Error(`no function public.${fn}`);
      signatures.set(fn, rows[0]);
    }
    return signatures.get(fn);
  }

  return {
    bucket,
    calls,
    objects,

    async insert(table, row) {
      const keys = Object.keys(row);
      const params = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
      const { rows } = await pg.query(
        `insert into public.${ident(table)} (${keys.map(ident).join(', ')})
         values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
        params
      );
      calls.push(['insert', table]);
      return rows[0];
    },

    async insertMany(table, rowsIn, { onConflict } = {}) {
      for (const row of rowsIn) {
        const keys = Object.keys(row);
        const params = keys.map((k) => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
        await pg.query(
          `insert into public.${ident(table)} (${keys.map(ident).join(', ')})
           values (${keys.map((_, i) => `$${i + 1}`).join(', ')})
           ${onConflict ? `on conflict (${onConflict.split(',').map(ident).join(', ')}) do nothing` : ''}`,
          params
        );
      }
      calls.push(['insertMany', table, rowsIn.length]);
      return null;
    },

    async update(table, filters, patch) {
      const params = [];
      const sets = Object.entries(patch).map(([k, v]) => {
        params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
        return `${ident(k)} = $${params.length}`;
      });
      const { rows } = await pg.query(`update public.${ident(table)} set ${sets.join(', ')}${where(filters, params)} returning *`, params);
      calls.push(['update', table]);
      return rows;
    },

    async select(table, filters = {}) {
      const params = [];
      const cols = filters.select ? filters.select.split(',').map((c) => ident(c.trim())).join(', ') : '*';
      let sql = `select ${cols} from public.${ident(table)}${where(filters, params)}`;
      if (filters.order) {
        const [col, dir] = filters.order.split('.');
        sql += ` order by ${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'} nulls last`;
      }
      if (filters.limit) sql += ` limit ${Number(filters.limit)}`;
      const { rows } = await pg.query(sql, params);
      return rows;
    },

    async remove(table, filters) {
      const params = [];
      const { rows } = await pg.query(`delete from public.${ident(table)}${where(filters, params)} returning *`, params);
      calls.push(['remove', table]);
      return rows;
    },

    async rpc(fn, args = {}) {
      const sig = await signature(fn);
      const names = sig.names || [];
      const params = [];
      const named = Object.entries(args).map(([k, v]) => {
        const idx = names.indexOf(k);
        if (idx < 0) throw new Error(`public.${fn} has no argument ${k}`);
        params.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
        return `${ident(k)} => $${params.length}::${sig.types[idx]}`;
      });
      calls.push(['rpc', fn]);
      const call = `public.${ident(fn)}(${named.join(', ')})`;
      if (sig.set) return (await pg.query(`select * from ${call}`, params)).rows;
      if (sig.rettype === 'c') {
        const row = (await pg.query(`select * from ${call}`, params)).rows[0];
        return row && Object.values(row).every((v) => v === null) ? null : row;
      }
      const { rows } = await pg.query(`select ${call} as v`, params);
      return rows[0]?.v ?? null;
    },

    async signedUploadUrl(path) {
      return { url: `https://storage.test/upload/${bucket}/${path}?token=up`, token: 'up' };
    },

    async signedDownloadUrl(path, expiresIn, downloadName) {
      return `https://storage.test/sign/${bucket}/${path}?token=dl-${expiresIn}${downloadName ? `&download=${downloadName}` : ''}`;
    },

    async listObjects(prefix, { limit = 1000, offset = 0 } = {}) {
      const base = `${prefix.replace(/\/+$/, '')}/`;
      const seen = new Map();
      for (const path of [...objects.keys()].sort()) {
        if (!path.startsWith(base)) continue;
        const [name, ...rest] = path.slice(base.length).split('/');
        if (!seen.has(name)) seen.set(name, { name, id: rest.length ? null : `id-${path}` });
      }
      return [...seen.values()].slice(offset, offset + limit);
    },

    async removeObjects(paths) {
      calls.push(['removeObjects', paths.length]);
      return paths.filter((p) => objects.delete(p)).map((name) => ({ name }));
    },
  };
}
