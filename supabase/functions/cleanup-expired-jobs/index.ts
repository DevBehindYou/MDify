// Deploy after the cleanup recovery migration; authenticate only the MDify cron.
import { createClient } from "jsr:@supabase/supabase-js@2.117.2";
import { createCleanupHandler } from "./cleanup.mjs";

Deno.serve(createCleanupHandler({
  env: (name: string) => Deno.env.get(name),
  createClient: (url: string, key: string) => createClient(url, key, {
    auth: { persistSession: false },
    // Requests finish well inside the 30 minute ownership lease.
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }) },
  }),
}));
