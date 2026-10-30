import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { addStaff, listStaff } from "@/lib/services/staff";

// Staff management is super admin only (the "staff" area).

// GET -> everyone on the team
export async function GET() {
  const auth = await requireAdmin("staff", "view");
  if ("response" in auth) return auth.response;
  return NextResponse.json({ staff: await listStaff() }, { headers: { "Cache-Control": "no-store" } });
}

// POST { email, role: "admin" | "manager" | "super_admin", grants?: { [area]: "view" | "edit" } }
// The person must already have an account. Without `grants` the role's starting template is used.
export async function POST(request: Request) {
  const auth = await requireAdmin("staff");
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: { code: "invalid_email", message: "Enter the person's account email." } }, { status: 400 });

  const result = await addStaff(auth.admin.id, { email, role: String(body.role ?? ""), grants: body.grants });
  if ("error" in result) {
    const messages = {
      no_account: ["404", "No account with that email. They need to sign up first."],
      already_staff: ["409", "That person is already on the staff list."],
      invalid_role: ["400", "Choose a role: admin or manager."],
    } as Record<string, [string, string]>;
    const [status, message] = messages[result.error] ?? ["400", "Couldn't add that person."];
    return NextResponse.json({ error: { code: result.error, message } }, { status: Number(status) });
  }
  return NextResponse.json({ ok: true, id: result.id }, { status: 201 });
}
