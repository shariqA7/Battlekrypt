import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { addMember, listMembers } from "@/lib/services/org-members";

export async function GET() {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listMembers(auth.organizerProfile.id));
}

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const role = body.role === "manager" ? "manager" : "staff";
  const result = await addMember(auth.organizerProfile.id, {
    email: String(body.email ?? ""),
    name: typeof body.name === "string" ? body.name : undefined,
    role,
  });
  if (result.error) {
    const messages = {
      invalid_email: "Enter a valid email address.",
      is_owner: "That's the account owner's email.",
      already_member: "That person is already a member.",
      not_found: "Organization not found.",
    } as const;
    return NextResponse.json(
      { error: { code: result.error, message: messages[result.error] } },
      { status: result.error === "invalid_email" ? 400 : 409 }
    );
  }
  return NextResponse.json(result.data, { status: 201 });
}
