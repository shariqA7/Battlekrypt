"use client";

// Reusable rule list + "+" picker. Two modes:
//  - Local (no tournamentId): used on the "New tournament" form, where the
//    tournament doesn't exist yet — rules just live in this component's
//    state and go out with the rest of the create payload.
//  - Live (tournamentId set): used on an existing tournament — each add/
//    edit/delete calls the API immediately.
//
// Suggestions are fetched from /api/suggested-rules, never hard-coded — an
// admin can add, hide or remove them at any time and this picker just shows
// whatever is currently active for the chosen game.
import { useEffect, useState } from "react";

export type RuleAction = "warning" | "point_deduction" | "disqualification";

export interface EditableRule {
  id?: string; // present once saved to a real tournament
  title: string | null;
  description: string;
  action: RuleAction;
  penaltyPoints: number | null;
  suggestedRuleId: string | null;
}

interface SuggestedRule {
  id: string;
  title: string;
  description: string;
  action: RuleAction;
  penaltyPoints: number | null;
}

const ACTION_LABEL: Record<RuleAction, string> = {
  warning: "Warning",
  point_deduction: "Point deduction",
  disqualification: "Disqualification",
};

function actionText(action: RuleAction, penaltyPoints: number | null) {
  if (action === "point_deduction" && penaltyPoints) {
    return `${ACTION_LABEL[action]} (−${penaltyPoints} pt${penaltyPoints === 1 ? "" : "s"})`;
  }
  return ACTION_LABEL[action];
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const smallBtn =
  "border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 disabled:opacity-50";

export default function RulesEditor({
  gameId,
  tournamentId,
  rules,
  onChange,
  locked = false,
}: {
  gameId: string;
  // Omit for the "new tournament" (local) mode.
  tournamentId?: string;
  rules: EditableRule[];
  onChange: (rules: EditableRule[]) => void;
  locked?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedRule[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Custom-rule draft
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState<RuleAction>("warning");
  const [points, setPoints] = useState(5);

  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/suggested-rules?gameId=${encodeURIComponent(gameId)}`)
      .then((r) => r.json())
      .then((json) => setSuggestions(json.data ?? []))
      .catch(() => setSuggestions([]));
  }, [gameId]);

  // Derived rather than cleared in the effect: no game picked -> nothing shown.
  const usedSuggestionIds = new Set(rules.map((r) => r.suggestedRuleId).filter(Boolean));
  const available = gameId ? suggestions.filter((s) => !usedSuggestionIds.has(s.id)) : [];

  async function addRule(rule: EditableRule) {
    if (!tournamentId) {
      onChange([...rules, rule]);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error.message);
      return;
    }
    onChange([...rules, json]);
  }

  async function removeRule(index: number) {
    const rule = rules[index];
    if (!tournamentId || !rule.id) {
      onChange(rules.filter((_, i) => i !== index));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/rules/${rule.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error.message);
      return;
    }
    onChange(rules.filter((_, i) => i !== index));
  }

  function addFromSuggestion(s: SuggestedRule) {
    void addRule({
      title: s.title,
      description: s.description,
      action: s.action,
      penaltyPoints: s.penaltyPoints,
      suggestedRuleId: s.id,
    });
    setShowPicker(false);
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    if (description.trim().length < 3) return;
    void addRule({
      title: title.trim() || null,
      description: description.trim(),
      action,
      penaltyPoints: action === "point_deduction" ? points : null,
      suggestedRuleId: null,
    });
    setTitle("");
    setDescription("");
    setAction("warning");
    setShowCustom(false);
    setShowPicker(false);
  }

  return (
    <div>
      {rules.length > 0 && (
        <div className="flex flex-col gap-2 mb-3">
          {rules.map((r, i) => (
            <div
              key={r.id ?? i}
              className="bg-bk-surface border border-bk-border px-3 py-2 flex items-start justify-between gap-3"
            >
              <div>
                {r.title && (
                  <p className="font-sans text-bk-heading text-[13px]">{r.title}</p>
                )}
                <p className="font-sans text-bk-body text-[12px]">{r.description}</p>
                <p className="font-sans text-bk-gold-light text-[11px] mt-1">
                  {actionText(r.action, r.penaltyPoints)}
                </p>
              </div>
              {!locked && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeRule(i)}
                  className={smallBtn}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {locked ? (
        <p className="font-sans text-bk-muted text-[12px]">
          Rules are locked once registration closes.
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="font-sans text-bk-heading text-[12px] border border-bk-border px-3 py-1.5"
          >
            + Add rule
          </button>

          {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}

          {showPicker && (
            <div className="bg-bk-surface border border-bk-border p-3 mt-2">
              {available.length > 0 && (
                <>
                  <p className="font-sans text-bk-muted text-[11px] uppercase tracking-[0.5px] mb-2">
                    Suggested
                  </p>
                  <div className="flex flex-col gap-1.5 mb-3">
                    {available.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy}
                        onClick={() => addFromSuggestion(s)}
                        className="text-left bg-bk-bg border border-bk-border px-3 py-2 hover:border-bk-gold-light disabled:opacity-50"
                      >
                        <p className="font-sans text-bk-heading text-[13px]">{s.title}</p>
                        <p className="font-sans text-bk-body text-[12px]">{s.description}</p>
                        <p className="font-sans text-bk-gold-light text-[11px] mt-1">
                          {actionText(s.action, s.penaltyPoints)}
                        </p>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!showCustom ? (
                <button
                  type="button"
                  onClick={() => setShowCustom(true)}
                  className="font-sans text-bk-muted text-[12px] underline"
                >
                  Write your own rule instead
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title (optional)"
                    className={inputClass}
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the rule"
                    rows={2}
                    className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2"
                  />
                  <div className="flex gap-2">
                    <select
                      value={action}
                      onChange={(e) => setAction(e.target.value as RuleAction)}
                      className={inputClass}
                    >
                      <option value="warning">Warning</option>
                      <option value="point_deduction">Point deduction</option>
                      <option value="disqualification">Disqualification</option>
                    </select>
                    {action === "point_deduction" && (
                      <input
                        type="number"
                        min={1}
                        value={points}
                        onChange={(e) => setPoints(Number(e.target.value))}
                        placeholder="Points"
                        className={`${inputClass} w-24`}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy || description.trim().length < 3}
                    onClick={submitCustom}
                    className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase tracking-[0.5px] py-2 disabled:opacity-50"
                  >
                    Add this rule
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
