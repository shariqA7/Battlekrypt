import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { banUser } from "@/lib/services/bans";

// POST { reason: string, days: number | null }   (null = permanent)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const days = body.days === null ? null : Number(body.days);
  if (reason.length < 5 || reason.length > 500) {
    return NextResponse.json(
      { error: { code: "invalid_reason", message: "Give a reason (5–500 characters) — the user will see it." } },
      { status: 400 }
    );
  }
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    return NextResponse.json(
      { error: { code: "invalid_days", message: "Ban length must be 1–3650 days, or permanent." } },
      { status: 400 }
    );
  }

  const result = await banUser(id, reason, days, auth.admin.id);
  if (result.error) {
    return NextResponse.json(
      {
        error: {
          code: result.error,
          message: result.error === "is_admin" ? "Admins can't be banned." : "User not found.",
        },
      },
      { status: result.error === "not_found" ? 404 : 409 }
    );
  }
  return NextResponse.json({ id: result.data.id }, { status: 201 });
}
