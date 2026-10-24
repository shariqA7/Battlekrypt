// Scheduled deletion of identity documents (run daily; see vercel.json).
//   1. images of decided records past their retention date (and not on hold)
//   2. abandoned uploads: files in the bucket that no record points to, older
//      than two days (an upload never submitted, or replaced by a resubmission)
//
// Call with:  Authorization: Bearer $CRON_SECRET   (Vercel Cron sends it itself)
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ID_BUCKET } from "@/lib/identity";
import { purgeDueIdentityFiles, referencedIdentityPaths } from "@/lib/services/identity";

const TWO_DAYS = 2 * 86_400_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Unauthorized." } }, { status: 401 });
  }

  const storage = createServiceClient().storage.from(ID_BUCKET);

  const purged = await purgeDueIdentityFiles(async (paths) => {
    const { error } = await storage.remove(paths);
    if (error) throw new Error(`Couldn't delete identity files: ${error.message}`);
  });

  // Abandoned uploads: one folder per user (<userId>/<file>).
  let abandoned = 0;
  const keep = await referencedIdentityPaths();
  const { data: folders } = await storage.list("", { limit: 1000 });
  for (const folder of folders ?? []) {
    if (folder.id) continue; // a file at the top level, not a user folder
    const { data: files } = await storage.list(folder.name, { limit: 1000 });
    const stale = (files ?? [])
      .filter((f) => f.id && !keep.has(`${folder.name}/${f.name}`))
      .filter((f) => f.created_at && Date.now() - new Date(f.created_at).getTime() > TWO_DAYS)
      .map((f) => `${folder.name}/${f.name}`);
    if (stale.length) {
      const { error } = await storage.remove(stale);
      if (!error) abandoned += stale.length;
    }
  }

  return NextResponse.json({ ok: true, purged, abandoned });
}
