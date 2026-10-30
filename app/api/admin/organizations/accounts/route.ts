// POST /api/admin/organizations/accounts — { email, name, phone? }
// Finds the account with that email, or creates one (no email is sent yet). Returns its id so the
// admin can go on with the organizer's details and ID photos.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { adminEnsureAccount } from "@/lib/services/admin-accounts";

const MESSAGES: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  invalid_name: "Enter the person's name (2–80 characters).",
  not_configured: "Creating accounts isn't switched on: SUPABASE_SERVICE_ROLE_KEY is not set on the server.",
  failed: "Couldn't create the account.",
};

export async function POST(request: Request) {
  const auth = await requireAdmin("organizations");
  if ("response" in auth) return auth.response;
  const b = await request.json().catch(() => ({}));
  const result = await adminEnsureAccount({
    adminId: auth.admin.id,
    email: String(b.email ?? ""),
    name: String(b.name ?? ""),
    phone: typeof b.phone === "string" ? b.phone : undefined,
  });
  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error, message: result.message ?? MESSAGES[result.error] } }, { status: result.error === "not_configured" ? 503 : 400 });
  }
  return NextResponse.json(result.data, { status: result.data.created ? 201 : 200 });
}
