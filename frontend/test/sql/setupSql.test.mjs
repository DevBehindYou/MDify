// supabase/MDIFY_SETUP.sql (the file pasted into the SQL Editor) must match
// the migrations and apply in one go on a fresh database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SETUP_FILE, buildSetupSql } from '../../scripts/build-setup-sql.mjs';
import { SUPABASE_SHIM } from './pgliteDb.mjs';

test('MDIFY_SETUP.sql is up to date with the migrations', () => {
  assert.equal(fs.readFileSync(SETUP_FILE, 'utf8'), buildSetupSql(), 'run: npm run sql:setup');
});

test('MDIFY_SETUP.sql applies in one transaction and can be pasted again', async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  await db.exec(fs.readFileSync(SETUP_FILE, 'utf8'));
  const { rows } = await db.query("select count(*)::int as n from pg_proc where proname in ('claim_work_items', 'forget_job_details')");
  assert.equal(rows[0].n, 2);

  // Pasting it a second time is safe and keeps existing data.
  await db.query("insert into public.jobs (original_filename, status) values ('a.pdf', 'UPLOADING')");
  await db.exec(fs.readFileSync(SETUP_FILE, 'utf8'));
  assert.equal((await db.query('select count(*)::int as n from public.jobs')).rows[0].n, 1);
});
