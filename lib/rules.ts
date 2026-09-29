// Structured tournament rules (spec §5): a rule has a title, a description,
// what happens when it's broken (warning / point deduction / disqualification)
// and optionally the one stage it applies to.
//
// Nothing here lists WHICH rules exist — the suggestions an organizer picks
// from live in the SuggestedRule table and are managed by admins. This file
// only defines the shape of a rule and how to validate one.

export const RULE_ACTIONS = ["warning", "point_deduction", "disqualification"] as const;
export type RuleAction = (typeof RULE_ACTIONS)[number];

export const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  warning: "Warning",
  point_deduction: "Point deduction",
  disqualification: "Disqualification",
};

export const MAX_RULES_PER_TOURNAMENT = 30;
export const MAX_TITLE_LENGTH = 80;
export const MIN_DESCRIPTION_LENGTH = 3;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_PENALTY_POINTS = 1000;

export function isRuleAction(value: unknown): value is RuleAction {
  return typeof value === "string" && (RULE_ACTIONS as readonly string[]).includes(value);
}

// "Warning", "Point deduction (−5 pts)", "Disqualification"
export function formatRuleAction(action: RuleAction, penaltyPoints?: number | null): string {
  if (action === "point_deduction" && penaltyPoints) {
    return `${RULE_ACTION_LABELS[action]} (−${penaltyPoints} pt${penaltyPoints === 1 ? "" : "s"})`;
  }
  return RULE_ACTION_LABELS[action];
}

// What an organizer (or admin, for suggestions) submits for one rule.
export interface RuleFields {
  title: string | null;
  description: string;
  action: RuleAction;
  penaltyPoints: number | null;
}

export interface ParsedRule extends RuleFields {
  appliesToStageId: string | null;
  suggestedRuleId: string | null;
}

export type RuleParseResult =
  | { ok: true; value: ParsedRule }
  | { ok: false; message: string };

function optionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Validates the parts shared by tournament rules and admin suggestions.
export function parseRuleFields(input: Record<string, unknown>): 
  | { ok: true; value: RuleFields }
  | { ok: false; message: string } {
  let title: string | null = null;
  if (input.title !== undefined && input.title !== null) {
    if (typeof input.title !== "string") return { ok: false, message: "Title must be text." };
    title = input.title.trim() || null;
    if (title && title.length > MAX_TITLE_LENGTH) {
      return { ok: false, message: `Title can be at most ${MAX_TITLE_LENGTH} characters.` };
    }
  }

  if (typeof input.description !== "string") {
    return { ok: false, message: "A rule needs a description." };
  }
  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) {
    return { ok: false, message: "A rule needs a description." };
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      message: `A rule description can be at most ${MAX_DESCRIPTION_LENGTH} characters.`,
    };
  }

  const action = input.action === undefined || input.action === null ? "warning" : input.action;
  if (!isRuleAction(action)) {
    return {
      ok: false,
      message: `Action must be one of: ${RULE_ACTIONS.join(", ")}.`,
    };
  }

  let penaltyPoints: number | null = null;
  const rawPoints = input.penaltyPoints;
  const hasPoints = rawPoints !== undefined && rawPoints !== null;
  if (action === "point_deduction") {
    if (
      typeof rawPoints !== "number" ||
      !Number.isInteger(rawPoints) ||
      rawPoints < 1 ||
      rawPoints > MAX_PENALTY_POINTS
    ) {
      return {
        ok: false,
        message: `A point deduction needs a whole number of points between 1 and ${MAX_PENALTY_POINTS}.`,
      };
    }
    penaltyPoints = rawPoints;
  } else if (hasPoints) {
    return { ok: false, message: "Points can only be set on a point deduction rule." };
  }

  return { ok: true, value: { title, description, action, penaltyPoints } };
}

// One rule from an API payload. A bare string is the original "one rule per
// line" format and becomes a custom warning rule, so existing clients keep
// working.
export function parseRuleInput(input: unknown): RuleParseResult {
  if (typeof input === "string") {
    const parsed = parseRuleFields({ description: input });
    return parsed.ok
      ? { ok: true, value: { ...parsed.value, appliesToStageId: null, suggestedRuleId: null } }
      : parsed;
  }
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "Each rule must be text or an object." };
  }

  const obj = input as Record<string, unknown>;
  const parsed = parseRuleFields(obj);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    value: {
      ...parsed.value,
      appliesToStageId: optionalId(obj.appliesToStageId),
      suggestedRuleId: optionalId(obj.suggestedRuleId),
    },
  };
}

export type RuleListParseResult =
  | { ok: true; value: ParsedRule[] }
  | { ok: false; message: string };

// The rules array sent when creating a tournament. Stage scoping isn't
// possible yet (stages are created after the tournament) so it's dropped, and
// the same suggestion can't be added twice.
export function parseRuleList(input: unknown): RuleListParseResult {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, message: "rules must be a list." };
  if (input.length > MAX_RULES_PER_TOURNAMENT) {
    return {
      ok: false,
      message: `A tournament can have at most ${MAX_RULES_PER_TOURNAMENT} rules.`,
    };
  }

  const rules: ParsedRule[] = [];
  const seenSuggestions = new Set<string>();
  for (const item of input) {
    // Blank lines from the old textarea format are simply skipped.
    if (typeof item === "string" && !item.trim()) continue;

    const parsed = parseRuleInput(item);
    if (!parsed.ok) return parsed;

    const rule = { ...parsed.value, appliesToStageId: null };
    if (rule.suggestedRuleId) {
      if (seenSuggestions.has(rule.suggestedRuleId)) continue;
      seenSuggestions.add(rule.suggestedRuleId);
    }
    rules.push(rule);
  }
  return { ok: true, value: rules };
}
