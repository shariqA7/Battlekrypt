// Service-role Supabase client. It can read and delete EVERY file, so it is used only
// where the code has ALREADY decided the person may see or touch the file:
//   - the scheduled identity-document deletion job (app/api/cron/identity-retention)
//   - lib/services/admin-accounts.ts, which lets an admin create an organizer's login
//   - lib/services/proof-access.ts, which signs links to PRIVATE payment proofs after
//     authorizeProofView() has checked who is asking, and lib/services/proof-fingerprints.ts,
//     which reads a proof to check it for duplicates
//   - scripts/migrate-proofs-to-private.ts (run by hand)
// Never import it from pages or other routes, and never expose the key to the browser (it has
// no NEXT_PUBLIC_ prefix).
import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
