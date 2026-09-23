// GET /api/site-settings — public, used by the auth pages (and anywhere
// else) to show the admin-uploaded logo
import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/services/tournaments";

export async function GET() {
  const settings = await getSiteSettings();
  return NextResponse.json(settings);
}
