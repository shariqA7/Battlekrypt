import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { upholdClaim } from "@/lib/services/club-name-claims";

// Body: { banDays: number | null, note?: string }   (null = permanent ban)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const banDays = body.banDays === null ? null : Number(body.banDays);
  if (banDays !== null && Number.isNaN(banDays)) {
    return NextResponse.json(
      { error: { code: "invalid_ban", message: "Choose how long to ban the club owner." } },
      { status: 400 }
    );
  }

  const result = await upholdClaim(id, auth.admin.id, {
    banDays,
    note: typeof body.note === "string" ? body.note : undefined,
  });
  if (result.error) {
    const messages = {
      not_found: "Claim not found.",
      not_pending: "This claim has already been decided.",
      invalid_ban: "Ban length must be 1–3650 days, or permanent.",
      owner_is_admin: "The club owner is an admin and can't be banned.",
    } as const;
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] } },
      { status: result.error === "not_found" ? 404 : result.error === "invalid_ban" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data);
}
