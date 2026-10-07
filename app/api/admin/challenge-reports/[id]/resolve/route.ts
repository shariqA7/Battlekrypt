// POST { action: "remove" | "dismiss", note, ban?: "none" | "permanent" | <days> }
// [id] is the CHALLENGE's id: every open report on it is decided together.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { resolveReports, type ModerationBan } from "@/lib/services/challenge-moderation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (body.action !== "remove" && body.action !== "dismiss") {
    return NextResponse.json({ error: { code: "validation_error", message: "Choose remove or dismiss." } }, { status: 400 });
  }
  let ban: ModerationBan = null;
  if (body.ban === "permanent") ban = { days: null };
  else if (body.ban !== undefined && body.ban !== "none" && body.ban !== null) {
    const days = Number(body.ban);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return NextResponse.json({ error: { code: "validation_error", message: "Ban length must be 1–3650 days, or permanent." } }, { status: 400 });
    }
    ban = { days };
  }

  const result = await resolveReports(auth.admin.id, id, {
    action: body.action,
    note: typeof body.note === "string" ? body.note : "",
    ban,
  });
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "validation_error" ? 400 : 409;
    return NextResponse.json({ error: { code: result.error, message: result.message } }, { status });
  }
  return NextResponse.json(result.data);
}
