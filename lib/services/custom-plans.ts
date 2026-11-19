// "Customize your plan" (Talk to sales). An organizer says what they want in a plan. An admin looks at
// it, decides a price, and "sends a quote": that makes a PRIVATE plan for that organizer only
// (Plan.privateForUserId), which then shows up on their Plans page and is bought through the normal
// plan purchase flow (payment proof, approval, invoice). Rules: lib/custom-plan-rules.ts.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { createPlan, updatePlan } from "@/lib/services/plan-requests";
import { formatMoney } from "@/lib/money";
import { MAX_OPEN_CUSTOM_REQUESTS, completeOrganizerLimits, validateCustomRequest } from "@/lib/custom-plan-rules";

export async function submitCustomPlanRequest(userId: string, raw: Record<string, unknown>) {
  const org = await prisma.organizerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!org) return { error: "not_organizer" as const, message: "Only organizers can ask for a custom plan." };
  const v = validateCustomRequest(raw);
  if (!v.ok) return { error: "validation_error" as const, message: v.message };
  const open = await prisma.customPlanRequest.count({ where: { userId, status: { in: ["open", "quoted"] } } });
  if (open >= MAX_OPEN_CUSTOM_REQUESTS) {
    return { error: "too_many" as const, message: "You already have requests waiting. We'll get back to you on those first." };
  }
  const row = await prisma.customPlanRequest.create({
    data: {
      userId, contactName: v.value.contactName, contactEmail: v.value.contactEmail, contactPhone: v.value.contactPhone,
      limits: v.value.limits as object, note: v.value.note,
    },
    select: { id: true },
  });
  return { data: row };
}

export async function getMyCustomRequests(userId: string) {
  const rows = await prisma.customPlanRequest.findMany({
    where: { userId, status: { in: ["open", "quoted"] } }, orderBy: { createdAt: "desc" },
    select: { id: true, status: true, createdAt: true, quotedPlanCode: true },
  });
  return rows;
}

export async function countOpenCustomRequests() {
  return prisma.customPlanRequest.count({ where: { status: "open" } });
}

export async function listCustomRequestsForAdmin(status?: string | null) {
  const rows = await prisma.customPlanRequest.findMany({
    where: status === "open" || status === "quoted" || status === "closed" ? { status } : {},
    orderBy: { createdAt: "desc" }, take: 200,
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const [orgs, plans] = await Promise.all([
    prisma.organizerProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, orgName: true, planCode: true } }),
    prisma.plan.findMany({
      where: { OR: [{ code: { in: rows.map((r) => r.quotedPlanCode).filter((c): c is string => !!c) } }, { audience: "organizer", privateForUserId: null }] },
      select: { code: true, name: true, priceAmount: true, priceCurrency: true, durationDays: true, limits: true },
    }),
  ]);
  const orgBy = new Map(orgs.map((o) => [o.userId, o]));
  const planBy = new Map(plans.map((p) => [p.code, p]));
  return rows.map((r) => {
    const org = orgBy.get(r.userId);
    const quoted = r.quotedPlanCode ? planBy.get(r.quotedPlanCode) : null;
    return {
      id: r.id, status: r.status, createdAt: r.createdAt, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone,
      note: r.note, adminNote: r.adminNote, orgName: org?.orgName ?? "(no organizer account)", currentPlan: org ? planBy.get(org.planCode)?.name ?? org.planCode : null,
      limits: r.limits as Record<string, number | boolean | null>,
      quote: quoted ? { code: quoted.code, name: quoted.name, price: quoted.priceAmount ? Number(quoted.priceAmount.toString()) : null, currency: quoted.priceCurrency, days: quoted.durationDays } : null,
    };
  });
}

/** Make (or update) the private plan for this request and tell the organizer. */
export async function quoteCustomRequest(
  adminId: string, requestId: string,
  input: { priceAmount: unknown; priceCurrency: unknown; durationDays?: unknown; limits?: unknown; planName?: unknown; depositAmount?: unknown; adminNote?: unknown }
) {
  const req = await prisma.customPlanRequest.findUnique({ where: { id: requestId } });
  if (!req) return { error: "not_found" as const, message: "Request not found." };
  if (req.status === "closed") return { error: "invalid_status" as const, message: "This request is closed." };
  const org = await prisma.organizerProfile.findUnique({ where: { userId: req.userId }, select: { orgName: true } });
  if (!org) return { error: "validation_error" as const, message: "This person no longer has an organizer account." };

  const limits = completeOrganizerLimits(input.limits ?? req.limits);
  if (!limits.ok) return { error: "validation_error" as const, message: limits.message };
  const name = typeof input.planName === "string" && input.planName.trim() ? input.planName.trim() : `Custom plan for ${org.orgName}`.slice(0, 60);
  const note = typeof input.adminNote === "string" && input.adminNote.trim() ? input.adminNote.trim().slice(0, 1000) : null;

  const fields = { name, priceAmount: input.priceAmount, priceCurrency: input.priceCurrency, durationDays: input.durationDays ?? 30, limits: limits.value, depositAmount: input.depositAmount };
  const made = req.quotedPlanCode
    ? await updatePlan(req.quotedPlanCode, adminId, { ...fields, isActive: true })
    : await createPlan(adminId, { audience: "organizer", ...fields, privateForUserId: req.userId });
  if ("error" in made) return { error: "validation_error" as const, message: made.message ?? "Could not make the plan." };

  await prisma.customPlanRequest.update({
    where: { id: requestId },
    data: { status: "quoted", quotedPlanCode: made.data.code, adminNote: note, handledById: adminId, handledAt: new Date() },
  });
  const p = made.data;
  await notify(req.userId, {
    type: "plan",
    title: "Your custom plan quote is ready",
    body: `${p.name}: ${formatMoney(p.priceAmount ?? 0, p.priceCurrency ?? "USD")} for ${p.durationDays} days.${note ? ` ${note}` : ""} Open Plans to review and buy it.`,
    href: "/plans",
  }).catch(() => undefined);
  return { data: { planCode: p.code } };
}

/** Close a request. A quote that was sent is withdrawn: its private plan can no longer be bought. */
export async function closeCustomRequest(adminId: string, requestId: string, note?: unknown) {
  const req = await prisma.customPlanRequest.findUnique({ where: { id: requestId } });
  if (!req) return { error: "not_found" as const, message: "Request not found." };
  if (req.status === "closed") return { error: "invalid_status" as const, message: "This request is already closed." };
  if (req.quotedPlanCode) {
    const holders = await prisma.organizerProfile.count({ where: { planCode: req.quotedPlanCode } });
    // Only switch it off if nobody holds it yet (a bought plan keeps working until it expires).
    if (holders === 0) await updatePlan(req.quotedPlanCode, adminId, { isActive: false });
  }
  await prisma.customPlanRequest.update({
    where: { id: requestId },
    data: { status: "closed", adminNote: typeof note === "string" && note.trim() ? note.trim().slice(0, 1000) : req.adminNote, handledById: adminId, handledAt: new Date() },
  });
  return { data: { id: requestId } };
}
