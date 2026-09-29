"use client";

// Thin wrapper around RulesEditor for an already-created tournament: seeds
// its state from the tournament's saved rules, and every add/remove hits the
// API immediately (RulesEditor does this whenever tournamentId is passed).
import { useState } from "react";
import RulesEditor, { type EditableRule, type RuleAction } from "@/components/tournaments/RulesEditor";

interface SavedRule {
  id: string;
  title: string | null;
  description: string;
  action: RuleAction;
  penaltyPoints: number | null;
  suggestedRuleId: string | null;
}

export default function RulesManager({
  tournamentId,
  gameId,
  initialRules,
  locked,
}: {
  tournamentId: string;
  gameId: string;
  initialRules: SavedRule[];
  locked: boolean;
}) {
  const [rules, setRules] = useState<EditableRule[]>(initialRules);

  return (
    <RulesEditor
      tournamentId={tournamentId}
      gameId={gameId}
      rules={rules}
      onChange={setRules}
      locked={locked}
    />
  );
}
