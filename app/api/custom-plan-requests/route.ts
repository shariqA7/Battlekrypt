// POST /api/custom-plan-requests — an organizer's "Customize your plan" request (Talk to sales).
// body: { contactName, contactEmail?, contactPhone?, limits: { every plan option }, note? }
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { submitCustomPlanRequest } from "@/lib/services/custom-plans";

export async function POST(request: Request) {
  const auth = await requireOrganizer();
  if ("response" in auth) return auth.response;
  const userId = auth.organizerProfile.userId;
  const rl = await rateLimit(`custom-plan:${userId}`, 5, 24 * 60 * 60 * 1000);
  if (!rl.allowed) return NextResponse.json({ error: { code: "rate_limited", message: "You've sent several requests today. Please try again tomorrow." } }, { status: 429 });
  const b = await request.json().catch(() => ({}));
  const r = await submitCustomPlanRequest(userId, b);
  if ("error" in r) return NextResponse.json({ error: { code: r.error, message: r.message } }, { status: r.error === "not_organizer" ? 403 : 400 });
  return NextResponse.json(r.data, { status: 201 });
}
