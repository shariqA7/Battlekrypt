import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { removeStaff, updateStaff } from "@/lib/services/staff";

const MESSAGES: Record<string, [number, string]> = {
  not_found: [404, "That person isn't on the staff list."],
  invalid_role: [400, "Choose a role: super admin, admin or manager."],
  self: [409, "You can't change or remove your own staff access."],
  last_super_admin: [409, "There must always be at least one active super admin."],
};
const fail = (code: string) => {
  const [status, message] = MESSAGES[code] ?? [400, "Couldn't do that."];
  return NextResponse.json({ error: { code, message } }, { status });
};

// PATCH { role?, grants?, active? }  Super admin only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("staff");
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  const result = await updateStaff(auth.admin.id, id, {
    role: typeof body.role === "string" ? body.role : undefined,
    grants: body.grants,
    active: typeof body.active === "boolean" ? body.active : undefined,
  });
  return "error" in result ? fail(result.error) : NextResponse.json({ ok: true });
}

// DELETE: takes the person off the team (their account stays). Super admin only.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireAdmin("staff");
  if ("response" in auth) return auth.response;
  const result = await removeStaff(auth.admin.id, id);
  return "error" in result ? fail(result.error) : NextResponse.json({ ok: true });
}
