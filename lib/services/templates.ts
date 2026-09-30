// Tournament templates (spec §5): save a tournament's whole reusable
// config, then "Start from Template" pre-fills a new one from it.
//
// A template holds everything EXCEPT instance-specific fields (date, room
// credentials) — game, type, mode, capacity, entry fee structure, currency,
// stage NAMES, its rule set, custom fields, and the prize pool amount.
//
// Snapshot rule (spec §5, same as SuggestedRule): applying a template COPIES
// its rules and stage names onto the new tournament. Editing or deleting the
// template afterward never changes a tournament already created from it.

import { prisma } from "@/lib/prisma";
import { MAX_RULES_PER_TOURNAMENT } from "@/lib/rules";
import { checkOrganizerCanSaveTemplate } from "@/lib/services/plan-gates";

export const TEMPLATE_ERRORS = {
  validation_error: { status: 400, message: "Invalid template." },
  not_found: { status: 404, message: "Template not found." },
  forbidden: { status: 403, message: "This isn't your template." },
  source_forbidden: { status: 403, message: "You don't own this tournament." },
  plan_limit: { status: 403, message: "Your plan's template limit has been reached." },
} as const;

export type TemplateErrorCode = keyof typeof TEMPLATE_ERRORS;
type Fail = { error: TemplateErrorCode; message?: string };
const fail = (error: TemplateErrorCode, message?: string): Fail => ({ error, message });

const MAX_NAME_LENGTH = 80;
const MAX_TEMPLATES_PER_ORGANIZER = 100;

const templateInclude = {
  rules: { orderBy: { position: "asc" as const } },
  stages: { orderBy: { order: "asc" as const } },
} as const;

export async function listTemplates(organizerId: string) {
  return prisma.tournamentTemplate.findMany({
    where: { organizerId },
    include: { game: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTemplateById(id: string, organizerId: string) {
  const template = await prisma.tournamentTemplate.findUnique({
    where: { id },
    include: templateInclude,
  });
  if (!template) return fail("not_found");
  if (template.organizerId !== organizerId) return fail("forbidden");
  return { data: template };
}

// Saves an EXISTING tournament's current config as a new template — the
// organizer's own rules and stage names at this moment, copied in (not
// linked), so later changes to the tournament don't retroactively change the
// template either.
export async function createTemplateFromTournament(
  tournamentId: string,
  organizerId: string,
  name: string
) {
  const trimmedName = name.trim();
  if (!trimmedName || trimmedName.length > MAX_NAME_LENGTH) {
    return fail("validation_error", `Template name must be 1–${MAX_NAME_LENGTH} characters.`);
  }

  const organizer = await prisma.organizerProfile.findUnique({ where: { id: organizerId } });
  if (!organizer) return fail("forbidden");
  const planMessage = await checkOrganizerCanSaveTemplate(organizer);
  if (planMessage) return fail("plan_limit", planMessage);

  const count = await prisma.tournamentTemplate.count({ where: { organizerId } });
  if (count >= MAX_TEMPLATES_PER_ORGANIZER) {
    return fail("validation_error", `You can have at most ${MAX_TEMPLATES_PER_ORGANIZER} templates.`);
  }

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      rules: { orderBy: { position: "asc" } },
      stages: { orderBy: { order: "asc" } },
    },
  });
  if (!tournament) return fail("not_found");
  if (tournament.organizerId !== organizerId) return fail("source_forbidden");

  const created = await prisma.tournamentTemplate.create({
    data: {
      organizerId,
      name: trimmedName,
      gameId: tournament.gameId,
      type: tournament.type,
      mode: tournament.mode,
      maxTeamSize: tournament.maxTeamSize,
      maxTeams: tournament.maxTeams,
      playersPerRoom: tournament.playersPerRoom,
      format: tournament.format,
      entryType: tournament.entryType,
      entryFeeAmount: tournament.entryFeeAmount,
      entryFeeCurrency: tournament.entryFeeCurrency,
      paymentInstructions: tournament.paymentInstructions,
      prizePoolAmount: tournament.prizePoolAmount,
      prizePoolCurrency: tournament.prizePoolCurrency,
      customFields: tournament.customFields ?? undefined,
      rules: {
        create: tournament.rules.map((r, i) => ({
          title: r.title,
          description: r.description,
          action: r.action,
          penaltyPoints: r.penaltyPoints,
          suggestedRuleId: r.suggestedRuleId,
          position: i + 1,
        })),
      },
      stages: {
        create: tournament.stages.map((s, i) => ({ name: s.name, order: i })),
      },
    },
    include: templateInclude,
  });

  return { data: created };
}

export async function renameTemplate(id: string, organizerId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    return fail("validation_error", `Template name must be 1–${MAX_NAME_LENGTH} characters.`);
  }
  const existing = await prisma.tournamentTemplate.findUnique({ where: { id } });
  if (!existing) return fail("not_found");
  if (existing.organizerId !== organizerId) return fail("forbidden");

  const updated = await prisma.tournamentTemplate.update({
    where: { id },
    data: { name: trimmed },
  });
  return { data: updated };
}

export async function deleteTemplate(id: string, organizerId: string) {
  const existing = await prisma.tournamentTemplate.findUnique({ where: { id } });
  if (!existing) return fail("not_found");
  if (existing.organizerId !== organizerId) return fail("forbidden");

  // Rules/stages cascade via the relation — nothing else points at a
  // template (a tournament created from one holds its own copies), so this
  // is always safe.
  await prisma.tournamentTemplate.delete({ where: { id } });
  return { data: { id } };
}

// What the new-tournament form pre-fills from — the template's fields, plus
// its rules and stage names shaped for the create payload / RulesEditor.
export interface TemplatePrefill {
  gameId: string;
  type: string;
  mode: string;
  maxTeamSize: number | null;
  maxTeams: number;
  playersPerRoom: number | null;
  format: string;
  entryType: string;
  entryFee: { amount: number; currency: string } | null;
  paymentInstructions: string | null;
  prizePool: { amount: number; currency: string } | null;
  customFields: unknown;
  rules: {
    title: string | null;
    description: string;
    action: string;
    penaltyPoints: number | null;
    suggestedRuleId: string | null;
  }[];
  stageNames: string[];
}

export async function getTemplatePrefill(
  id: string,
  organizerId: string
): Promise<{ data: TemplatePrefill } | Fail> {
  const result = await getTemplateById(id, organizerId);
  if ("error" in result) return result;
  const t = result.data;

  // Capped at creation time too, but a template built before the cap existed
  // (or edited some other way) shouldn't silently overflow a new tournament.
  const rules = t.rules.slice(0, MAX_RULES_PER_TOURNAMENT).map((r) => ({
    title: r.title,
    description: r.description,
    action: r.action,
    penaltyPoints: r.penaltyPoints,
    suggestedRuleId: r.suggestedRuleId,
  }));

  return {
    data: {
      gameId: t.gameId,
      type: t.type,
      mode: t.mode,
      maxTeamSize: t.maxTeamSize,
      maxTeams: t.maxTeams,
      playersPerRoom: t.playersPerRoom,
      format: t.format,
      entryType: t.entryType,
      entryFee:
        t.entryFeeAmount !== null && t.entryFeeCurrency
          ? { amount: Number(t.entryFeeAmount), currency: t.entryFeeCurrency }
          : null,
      paymentInstructions: t.paymentInstructions,
      prizePool:
        t.prizePoolAmount !== null && t.prizePoolCurrency
          ? { amount: Number(t.prizePoolAmount), currency: t.prizePoolCurrency }
          : null,
      customFields: t.customFields,
      rules,
      stageNames: t.stages.map((s) => s.name),
    },
  };
}
