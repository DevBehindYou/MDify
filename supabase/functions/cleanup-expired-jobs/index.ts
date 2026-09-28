// Supabase Edge Function: cleanup-expired-jobs
//
// Run by Supabase Cron every 30 minutes (supabase/cron.sql). One run:
//   1. sweep_stale_jobs()      abandoned uploads → CANCELLED, stuck jobs → FAILED
//   2. claim_cleanup_batch()   atomic claim (FOR UPDATE SKIP LOCKED) of expired
//                              AUTO / EXTEND jobs; KEEP is never selected
//   3. per job: file_objects → DELETE_PENDING; every object under
//      jobs/<id>/ removed from Storage (inputs, outputs and the intermediate
//      files of scanned PDFs and ZIPs, registered or not); then
//      mark_job_files_deleted(): file_objects → DELETED, job → COMPLETE with
//      files_deleted_at, file names and paths inside archives cleared
//   4. one audit_logs row for the run
//
// Storage is deleted before metadata is finalized, never the other way round.
// A failed Storage delete leaves the job PARTIAL/ERROR for the next run; the
// claim RPC caps attempts. Status: IMPLEMENTED BUT UNTESTED (not deployed yet).

import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET = Deno.env.get("SUPABASE_STORAGE_BUCKET") ?? "mdify-pro-files";
const BATCH_SIZE = Number(Deno.env.get("CLEANUP_BATCH_SIZE") ?? "100");
const PAGE = 1000;
const REMOVE_CHUNK = 100;

type Db = ReturnType<typeof createClient>;

// Every object path under a folder. Folders come back from list() with
// id === null; the job layout is at most three levels deep.
async function listTree(db: Db, prefix: string, depth = 0): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        if (depth < 4) paths.push(...(await listTree(db, path, depth + 1)));
      } else {
        paths.push(path);
      }
    }
    if (!data || data.length < PAGE) return paths;
  }
}

async function removeAll(db: Db, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + REMOVE_CHUNK));
    if (error) throw new Error(error.message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Only the cron job (which sends the service key) may trigger deletions.
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false },
  });
  const started = Date.now();

  const swept = await db.rpc("sweep_stale_jobs");
  const claim = await db.rpc("claim_cleanup_batch", { batch_size: BATCH_SIZE });
  if (claim.error) {
    await db.from("audit_logs").insert({
      actor_type: "SYSTEM",
      actor_id: "cleanup-expired-jobs",
      action: "CLEANUP_FAILURE",
      details: { stage: "claim", error: claim.error.message },
    });
    return json({ error: "claim failed" }, 500);
  }

  let deleted = 0;
  let failed = 0;
  let bytes = 0;
  for (const job of claim.data ?? []) {
    const files = await db
      .from("file_objects")
      .select("object_path,size_bytes")
      .eq("job_id", job.job_id)
      .neq("storage_status", "DELETED");

    await db.from("jobs").update({ cleanup_state: "DELETING" }).eq("job_id", job.job_id);
    await db.from("file_objects").update({ storage_status: "DELETE_PENDING" }).eq("job_id", job.job_id).neq("storage_status", "DELETED");

    // Delete by folder, not by the registered list: scanned-PDF pages and
    // ZIP contents are stored as intermediate objects that file_objects never
    // lists. Removing an object that is already gone is not an error.
    try {
      const registered = (files.data ?? []).map((f: { object_path: string }) => f.object_path);
      const found = await listTree(db, `jobs/${job.job_id}`);
      await removeAll(db, [...new Set([...found, ...registered])]);
    } catch (err) {
      failed += 1;
      await db
        .from("jobs")
        .update({ cleanup_state: "PARTIAL", cleanup_last_error: String((err as Error).message).slice(0, 500) })
        .eq("job_id", job.job_id);
      continue;
    }

    deleted += 1;
    bytes += (files.data ?? []).reduce((n: number, f: { size_bytes: number | null }) => n + (f.size_bytes ?? 0), 0);
    // file_objects → DELETED, job → COMPLETE + files_deleted_at, names cleared.
    await db.rpc("mark_job_files_deleted", { p_job_id: job.job_id });
  }

  const summary = {
    swept: swept.data?.length ?? 0,
    claimed: claim.data?.length ?? 0,
    deleted,
    failed,
    bytes_deleted: bytes,
    duration_ms: Date.now() - started,
  };
  await db.from("audit_logs").insert({
    actor_type: "SYSTEM",
    actor_id: "cleanup-expired-jobs",
    action: failed ? "CLEANUP_FAILURE" : "CLEANUP_RUN",
    details: summary,
  });
  return json(summary);
});
