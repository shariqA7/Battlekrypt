// Rules service (Phase 3): the suggested-rule catalog admins manage, and the
// rules attached to each tournament.
//
// Guarantees enforced here (never just in the UI):
//  - A tournament's rules are its OWN copies. Adding a suggestion copies it;
//    editing or deleting the suggestion later changes nothing (spec §5).
//  - Rules can be changed while the tournament is still taking registrations
//    (draft / published / registration_open), then they're locked so players
//    aren't held to rules that changed after they signed up.
//  - A rule that was used to disqualify someone can never be deleted — the
//    disqualification's audit trail (spec §2) points at it.

import { prisma } from "@/lib/prisma";
import {
  MAX_RULES_PER_TOURNAMENT,
  parseRuleFields,
  parseRuleInput,
  type ParsedRule,
  type RuleFields,
} from "@/lib/rules";

export const RULE_ERRORS = {
  validation_error: { status: 400, message: "Invalid rule." },
  not_found: { status: 404, message: "Not found." },
  forbidden: { status: 403, message: "You don't own this tournament." },
  rules_locked: {
    status: 409,
    message: "Rules are locked once registration closes.",
  },
  rule_in_use: {
    status: 409,
    message:
      "This rule was used to disqualify a player, so it can't be deleted. Edit it instead.",
  },
  too_many_rules: {
    status: 409,
    message: `A tournament can have at most ${MAX_RULES_PER_TOURNAMENT} rules.`,
  },
  already_added: { status: 409, message: "That rule has already been added." },
  invalid_stage: { status: 400, message: "That stage doesn't belong to this tournament." },
} as const;

export type RuleErrorCode = keyof typeof RULE_ERRORS;
type Fail = { error: RuleErrorCode; message?: string };
const fail = (error: RuleErrorCode, message?: string): Fail => ({ error, message });

// Same window the club entry lock uses: rules can change until registration
// closes.
export const RULES_EDITABLE_STATUSES = ["draft", "published", "registration_open"];

// ------------------------------------------------------------
// Suggested rules (the catalog behind the "+" button)
// ------------------------------------------------------------

// What an organizer sees when adding rules: active suggestions that apply to
// every game, or to the category of the game they picked.
export async function listSuggestedRules(gameId?: string) {
  const game = gameId ? await prisma.game.findUnique({ where: { id: gameId } }) : null;

  return prisma.suggestedRule.findMany({
    where: {
      isActive: true,
      OR: [
        { gameCategory: null },
        ...(game?.category ? [{ gameCategory: game.category }] : []),
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

// Admin view: everything, including hidden ones.
export async function listAllSuggestedRules() {
  return prisma.suggestedRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

interface SuggestedRuleExtras {
  gameCategory: string | null;
  isActive: boolean;
}

function parseSuggestedExtras(
  input: Record<string, unknown>,
  defaults: SuggestedRuleExtras
): { ok: true; value: SuggestedRuleExtras } | { ok: false; message: string } {
  let gameCategory = defaults.gameCategory;
  if (input.gameCategory !== undefined) {
    if (input.gameCategory === null || input.gameCategory === "") {
      gameCategory = null;
    } else if (typeof input.gameCategory === "string") {
      gameCategory = input.gameCategory.trim().toLowerCase();
      if (!gameCategory || gameCategory.length > 30) {
        return { ok: false, message: "Game category must be 1–30 characters." };
      }
    } else {
      return { ok: false, message: "Game category must be text." };
    }
  }

  let isActive = defaults.isActive;
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") {
      return { ok: false, message: "isActive must be true or false." };
    }
    isActive = input.isActive;
  }

  return { ok: true, value: { gameCategory, isActive } };
}

export async function createSuggestedRule(input: Record<string, unknown>) {
  const fields = parseRuleFields(input);
  if (!fields.ok) return fail("validation_error", fields.message);
  const title = fields.value.title;
  if (!title) return fail("validation_error", "A suggested rule needs a title.");

  const extras = parseSuggestedExtras(input, { gameCategory: null, isActive: true });
  if (!extras.ok) return fail("validation_error", extras.message);

  const last = await prisma.suggestedRule.findFirst({ orderBy: { sortOrder: "desc" } });
  const created = await prisma.suggestedRule.create({
    data: { ...fields.value, title, ...extras.value, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  return { data: created };
}

// Partial update: only the fields sent change.
export async function updateSuggestedRule(id: string, input: Record<string, unknown>) {
  const existing = await prisma.suggestedRule.findUnique({ where: { id } });
  if (!existing) return fail("not_found");

  const fields = parseRuleFields({
    title: input.title !== undefined ? input.title : existing.title,
    description: input.description !== undefined ? input.description : existing.description,
    action: input.action !== undefined ? input.action : existing.action,
    // Switching away from point_deduction clears the points; switching to it
    // needs them supplied (or already present).
    penaltyPoints:
      input.penaltyPoints !== undefined
        ? input.penaltyPoints
        : (input.action ?? existing.action) === "point_deduction"
          ? existing.penaltyPoints
          : null,
  });
  if (!fields.ok) return fail("validation_error", fields.message);
  const title = fields.value.title;
  if (!title) return fail("validation_error", "A suggested rule needs a title.");

  const extras = parseSuggestedExtras(input, {
    gameCategory: existing.gameCategory,
    isActive: existing.isActive,
  });
  if (!extras.ok) return fail("validation_error", extras.message);

  const updated = await prisma.suggestedRule.update({
    where: { id },
    data: { ...fields.value, title, ...extras.value },
  });
  return { data: updated };
}

// Safe: tournaments hold copies, so nothing they show changes. Their
// suggestedRuleId just becomes null (provenance only).
export async function deleteSuggestedRule(id: string) {
  const existing = await prisma.suggestedRule.findUnique({ where: { id } });
  if (!existing) return fail("not_found");
  await prisma.suggestedRule.delete({ where: { id } });
  return { data: { id } };
}

// ------------------------------------------------------------
// A tournament's rules
// ------------------------------------------------------------

async function loadEditableTournament(tournamentId: string, organizerId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) return fail("not_found");
  if (tournament.organizerId !== organizerId) return fail("forbidden");
  if (!RULES_EDITABLE_STATUSES.includes(tournament.status)) return fail("rules_locked");
  return { tournament };
}

async function checkStage(tournamentId: string, stageId: string | null) {
  if (!stageId) return true;
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  return !!stage && stage.tournamentId === tournamentId;
}

const ruleInclude = { appliesToStage: { select: { id: true, name: true } } } as const;

export async function addTournamentRule(
  tournamentId: string,
  organizerId: string,
  input: unknown
) {
  const parsed = parseRuleInput(input);
  if (!parsed.ok) return fail("validation_error", parsed.message);
  const rule: ParsedRule = parsed.value;

  const loaded = await loadEditableTournament(tournamentId, organizerId);
  if ("error" in loaded) return loaded;

  if (!(await checkStage(tournamentId, rule.appliesToStageId))) return fail("invalid_stage");

  const existing = await prisma.tournamentRule.findMany({
    where: { tournamentId },
    select: { position: true, suggestedRuleId: true },
  });
  if (existing.length >= MAX_RULES_PER_TOURNAMENT) return fail("too_many_rules");
  if (rule.suggestedRuleId && existing.some((r) => r.suggestedRuleId === rule.suggestedRuleId)) {
    return fail("already_added");
  }

  // If the suggestion was deleted in the meantime, keep the rule (it's a
  // copy) and just drop the provenance link.
  let suggestedRuleId = rule.suggestedRuleId;
  if (suggestedRuleId) {
    const s = await prisma.suggestedRule.findUnique({ where: { id: suggestedRuleId } });
    if (!s) suggestedRuleId = null;
  }

  const position = existing.reduce((max, r) => Math.max(max, r.position), 0) + 1;
  const created = await prisma.tournamentRule.create({
    data: {
      tournamentId,
      title: rule.title,
      description: rule.description,
      action: rule.action,
      penaltyPoints: rule.penaltyPoints,
      appliesToStageId: rule.appliesToStageId,
      suggestedRuleId,
      position,
    },
    include: ruleInclude,
  });
  return { data: created };
}

// Replaces the editable fields of one rule (the form always sends them all).
export async function updateTournamentRule(
  tournamentId: string,
  ruleId: string,
  organizerId: string,
  input: unknown
) {
  const parsed = parseRuleInput(input);
  if (!parsed.ok) return fail("validation_error", parsed.message);
  const rule = parsed.value;

  const loaded = await loadEditableTournament(tournamentId, organizerId);
  if ("error" in loaded) return loaded;

  const existing = await prisma.tournamentRule.findUnique({ where: { id: ruleId } });
  if (!existing || existing.tournamentId !== tournamentId) return fail("not_found");

  if (!(await checkStage(tournamentId, rule.appliesToStageId))) return fail("invalid_stage");

  const updated = await prisma.tournamentRule.update({
    where: { id: ruleId },
    data: {
      title: rule.title,
      description: rule.description,
      action: rule.action,
      penaltyPoints: rule.penaltyPoints,
      appliesToStageId: rule.appliesToStageId,
    },
    include: ruleInclude,
  });
  return { data: updated };
}

export async function deleteTournamentRule(
  tournamentId: string,
  ruleId: string,
  organizerId: string
) {
  const loaded = await loadEditableTournament(tournamentId, organizerId);
  if ("error" in loaded) return loaded;

  const existing = await prisma.tournamentRule.findUnique({ where: { id: ruleId } });
  if (!existing || existing.tournamentId !== tournamentId) return fail("not_found");

  const used = await prisma.registration.count({ where: { disqualifiedRuleId: ruleId } });
  if (used > 0) return fail("rule_in_use");

  await prisma.tournamentRule.delete({ where: { id: ruleId } });
  return { data: { id: ruleId } };
}

// Used when creating a tournament: turns validated rules into nested-create
// data, dropping suggestion links that no longer exist.
export async function prepareRulesForCreate(rules: (RuleFields & { suggestedRuleId: string | null })[]) {
  const ids = rules.map((r) => r.suggestedRuleId).filter((id): id is string => !!id);
  const known = new Set(
    ids.length
      ? (await prisma.suggestedRule.findMany({ where: { id: { in: ids } }, select: { id: true } })).map(
          (s) => s.id
        )
      : []
  );

  return rules.map((r, index) => ({
    title: r.title,
    description: r.description,
    action: r.action,
    penaltyPoints: r.penaltyPoints,
    suggestedRuleId: r.suggestedRuleId && known.has(r.suggestedRuleId) ? r.suggestedRuleId : null,
    position: index + 1,
  }));
}
