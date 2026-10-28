// POST /api/admin/organizations — add an organization directly for an existing account
// body: { userId, orgName, country?, bio?, planCode?, duration?, liftLimits? }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { adminCreateOrganization } from "@/lib/services/admin-organizations";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await adminCreateOrganization({
    adminId: auth.admin.id,
    userId: String(b.userId ?? ""),
    orgName: String(b.orgName ?? ""),
    country: typeof b.country === "string" ? b.country : undefined,
    bio: typeof b.bio === "string" ? b.bio : undefined,
    planCode: typeof b.planCode === "string" && b.planCode ? b.planCode : undefined,
    duration: b.duration,
    liftLimits: b.liftLimits === true,
  });
  if ("error" in result) {
    const map: Record<string, { status: number; message: string }> = {
      not_found: { status: 404, message: "That account doesn't exist." },
      already_organizer: { status: 409, message: "That account already has an organization." },
      name_taken: { status: 409, message: "That organization name is already taken." },
    };
    const m = map[result.error ?? ""] ?? { status: 400, message: "message" in result && result.message ? result.message : "Invalid request." };
    return NextResponse.json({ error: { code: result.error, message: "message" in result && result.message ? result.message : m.message } }, { status: m.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
