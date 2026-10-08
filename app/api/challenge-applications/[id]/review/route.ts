// POST /api/challenge-applications/:id/review — an institute vouches for, or turns down, an applicant.
// Body: { approve: boolean }. The host may review any applicant; an accepted
// co-host only applicants from its own institute.
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { reviewChallengeApplication } from "@/lib/services/challenge-institutions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => ({}));
  if (typeof body.approve !== "boolean") {
    return NextResponse.json(
      { error: { code: "validation_error", message: "approve (true/false) is required." } },
      { status: 400 }
    );
  }
  const result = await reviewChallengeApplication(id, auth.organizerProfile.id, body.approve);
  if ("error" in result) {
    const map: Record<string, [number, string]> = {
      not_found: [404, "Application not found."],
      forbidden: [403, "You can't review this applicant."],
      not_institution_challenge: [409, "This challenge isn't institution-only."],
      not_reviewable: [409, "This application can no longer be reviewed."],
    };
    const [status, message] = map[result.error] ?? [400, "Couldn't review this application."];
    return NextResponse.json({ error: { code: result.error, message } }, { status });
  }
  return NextResponse.json(result.data);
}
