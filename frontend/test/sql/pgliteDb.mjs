// Real Postgres (PGlite, WebAssembly) with the minimum Supabase provides:
// the anon/authenticated/service_role roles and a storage schema. Loads every
// migration in supabase/migrations in order, so tests run the shipped SQL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MIGRATIONS_DIR = path.join(REPO, 'supabase', 'migrations');

export const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null,
    metadata jsonb,
    created_at timestamptz default now()
  );
`;

export async function freshDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (err) {
      throw new Error(`${file}: ${err.message}`);
    }
  }
  return db;
}
