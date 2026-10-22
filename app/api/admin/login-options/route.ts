// GET/PATCH /api/admin/login-options — { twitch: boolean }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { getLoginOptions, setTwitchLogin } from "@/lib/services/login-options";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await getLoginOptions());
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.twitch !== "boolean") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "twitch must be true or false." } },
      { status: 400 }
    );
  }
  return NextResponse.json(await setTwitchLogin(body.twitch));
}
