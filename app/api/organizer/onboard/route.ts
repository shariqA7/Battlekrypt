// POST /api/organizer/onboard — RETIRED. Organizers now register as an
// organization at /organizer/register and are approved by an admin
// (POST /api/organizations/apply). Kept as a 410 so any old client fails
// clearly instead of silently creating an unreviewed organizer.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "gone",
        message: "Register your organization at /organizer/register instead.",
      },
    },
    { status: 410 }
  );
}
