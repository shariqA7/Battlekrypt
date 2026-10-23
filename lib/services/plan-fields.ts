// Admin-defined extra fields on plans (e.g. "Dedicated manager", "Support
// hours"). They are DISPLAY-ONLY: they show on the plans page and nothing in
// the app changes behaviour because of them. Behaviour still comes from the
// typed limits in lib/plans.ts. Values live in Plan.extras as { fieldId: value }.
// Deleting a field removes its definition and its value from every plan.
import type { PlanAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PlanFieldKind = "text" | "number" | "flag";
export const FIELD_KINDS: PlanFieldKind[] = ["text", "number", "flag"];
const MAX_FIELDS_PER_AUDIENCE = 20;

export async function listPlanFields(audience?: PlanAudience) {
  return prisma.planField.findMany({
    where: audience ? { audience } : {},
    orderBy: [{ audience: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createPlanField(input: { audience: PlanAudience; label: unknown; kind: unknown }) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (label.length < 2 || label.length > 60) {
    return { error: "validation_error" as const, message: "Field name must be 2–60 characters." };
  }
  if (!FIELD_KINDS.includes(input.kind as PlanFieldKind)) {
    return { error: "validation_error" as const, message: "Choose text, number or yes/no." };
  }
  const existing = await prisma.planField.findMany({ where: { audience: input.audience }, select: { label: true, sortOrder: true } });
  if (existing.length >= MAX_FIELDS_PER_AUDIENCE) {
    return { error: "validation_error" as const, message: `Up to ${MAX_FIELDS_PER_AUDIENCE} custom fields per account type.` };
  }
  if (existing.some((f) => f.label.toLowerCase() === label.toLowerCase())) {
    return { error: "validation_error" as const, message: "A field with that name already exists." };
  }
  const data = await prisma.planField.create({
    data: {
      audience: input.audience,
      label,
      kind: input.kind as string,
      sortOrder: existing.reduce((m, f) => Math.max(m, f.sortOrder), 0) + 1,
    },
  });
  return { data };
}

export async function deletePlanField(id: string) {
  const field = await prisma.planField.findUnique({ where: { id } });
  if (!field) return { error: "not_found" as const };
  const plans = await prisma.plan.findMany({ where: { audience: field.audience }, select: { code: true, extras: true } });
  await prisma.$transaction([
    ...plans
      .filter((p) => p.extras && typeof p.extras === "object" && id in (p.extras as Record<string, unknown>))
      .map((p) => {
        const next = { ...(p.extras as Record<string, unknown>) };
        delete next[id];
        return prisma.plan.update({ where: { code: p.code }, data: { extras: next as object } });
      }),
    prisma.planField.delete({ where: { id } }),
  ]);
  return { data: { id } };
}

// Strict validation of a plan's extras against the current field list.
export async function validateExtras(
  audience: PlanAudience,
  raw: unknown
): Promise<{ ok: true; value: Record<string, string | number | boolean> } | { ok: false; message: string }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: "Extras must be an object." };
  const fields = await prisma.planField.findMany({ where: { audience } });
  const byId = new Map(fields.map((f) => [f.id, f]));
  const out: Record<string, string | number | boolean> = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = byId.get(id);
    if (!f) continue; // field was deleted meanwhile — drop silently
    if (v === null || v === "") continue; // empty = unset
    if (f.kind === "flag") {
      if (typeof v !== "boolean") return { ok: false, message: `"${f.label}" must be yes or no.` };
      out[id] = v;
    } else if (f.kind === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, message: `"${f.label}" must be a number.` };
      out[id] = v;
    } else {
      if (typeof v !== "string" || v.length > 200) return { ok: false, message: `"${f.label}" must be text up to 200 characters.` };
      out[id] = v.trim();
    }
  }
  return { ok: true, value: out };
}

// For display: the plan's values joined with current field definitions, in
// field order, skipping unset fields. Orphaned values are ignored.
export function describeExtras(
  fields: { id: string; label: string; kind: string }[],
  extras: unknown
): { label: string; value: string }[] {
  const src = extras && typeof extras === "object" && !Array.isArray(extras) ? (extras as Record<string, unknown>) : {};
  return fields.flatMap((f) => {
    const v = src[f.id];
    if (v === undefined || v === null || v === "") return [];
    if (f.kind === "flag") return v === true ? [{ label: f.label, value: "Included" }] : [];
    return [{ label: f.label, value: String(v) }];
  });
}
