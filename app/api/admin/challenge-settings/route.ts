import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-helpers";
import { setChallengeReviewUsd } from "@/lib/services/challenges";

// PATCH { reviewUsd: number } — cash prizes above this (in USD) wait for admin approval.
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const result = await setChallengeReviewUsd(auth.admin.id, Number(body.reviewUsd));
  if ("error" in result) {
    return NextResponse.json(
      { error: { code: "invalid_amount", message: "Enter an amount of at least $1." } },
      { status: 400 }
    );
  }
  return NextResponse.json(result.data);
}
