// POST /api/admin/identity/:id/decision
//   Body: { action: "approve", over18: true }
//      or { action: "reject", note }
//      or { action: "hold" | "release" }   (keep the images past their delete date)
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { decideIdentity, setIdentityRetentionHold } from "@/lib/services/identity";

const MESSAGES: Record<string, string> = {
  not_found: "Not found.",
  not_pending: "This check was already decided.",
  need_over18: "Confirm that the document shows the person is 18 or older.",
  need_note: "Tell the organizer what to fix.",
  already_deleted: "The images were already deleted.",
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));

  const result =
    b.action === "hold" || b.action === "release"
      ? await setIdentityRetentionHold(id, b.action === "hold", auth.admin.id)
      : b.action === "approve" || b.action === "reject"
        ? await decideIdentity(id, auth.admin.id, { action: b.action, note: typeof b.note === "string" ? b.note : undefined, over18: b.over18 === true })
        : ({ error: "invalid" } as const);

  if ("error" in result) {
    const code = result.error;
    return NextResponse.json({ error: { code, message: MESSAGES[code] ?? "Invalid request." } }, { status: code === "not_found" ? 404 : 400 });
  }
  return NextResponse.json({ ok: true });
}
