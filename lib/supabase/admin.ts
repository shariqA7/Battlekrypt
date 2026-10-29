// Service-role Supabase client. It can read and delete EVERY file, so it is used
// in exactly two places: the scheduled identity-document deletion job
// (app/api/cron/identity-retention) and lib/services/admin-accounts.ts, which lets
// an admin create the login for an organizer who has no account yet. Never import it
// from pages or other routes, and never expose the key to the browser (it has no
// NEXT_PUBLIC_ prefix).
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
