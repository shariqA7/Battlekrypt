import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOrgNameAvailable } from "@/lib/services/org-applications";

// GET /api/organizations/name-available?name=Falcon — used by the
// registration form to warn before submitting. Public: the person may not
// have an account yet.
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) return NextResponse.json({ available: false });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ available: await isOrgNameAvailable(name, user?.id) });
}
