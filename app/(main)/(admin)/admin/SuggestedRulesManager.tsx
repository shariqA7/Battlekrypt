"use client";

// Admin management of the suggested-rule catalog — the data behind
// organizers' "+ Add rule" picker. Nothing here is hard-coded: this panel
// IS how the list changes. Deleting or editing a suggestion never touches
// tournaments that already copied it (they hold their own copy).
import { useState } from "react";

type RuleAction = "warning" | "point_deduction" | "disqualification";

interface SuggestedRule {
  id: string;
  title: string;
  description: string;
  action: RuleAction;
  penaltyPoints: number | null;
  gameCategory: string | null;
  isActive: boolean;
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const smallBtn =
  "border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 disabled:opacity-50";

export default function SuggestedRulesManager({
  initialRules,
}: {
  initialRules: SuggestedRule[];
}) {
  const [rules, setRules] = useState(initialRules);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [action, setAction] = useState<RuleAction>("warning");
  const [points, setPoints] = useState(5);
  const [gameCategory, setGameCategory] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/suggested-rules");
    const json = await res.json();
    setRules(json.data ?? []);
  }

  async function toggleActive(rule: SuggestedRule) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/suggested-rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !rule.isActive }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return;
    }
    await refresh();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this suggestion? Tournaments that already added it keep their own copy.")) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/suggested-rules/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return;
    }
    await refresh();
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/suggested-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        action,
        penaltyPoints: action === "point_deduction" ? points : undefined,
        gameCategory: gameCategory.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error.message);
      return;
    }
    setTitle("");
    setDescription("");
    setAction("warning");
    setGameCategory("");
    setShowNew(false);
    await refresh();
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">
        Suggested rules ({rules.length})
      </p>
      <p className="font-sans text-bk-muted text-[12px] mb-3">
        These are what organizers see behind &quot;+ Add rule&quot;. Hiding one stops it
        being offered; it never changes a tournament that already added it.
      </p>

      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}

      <div className="flex flex-col gap-2 mb-3">
        {rules.map((r) => (
          <div
            key={r.id}
            className={`bg-bk-surface border border-bk-border px-3 py-2 flex items-start justify-between gap-3 ${
              r.isActive ? "" : "opacity-50"
            }`}
          >
            <div>
              <p className="font-sans text-bk-heading text-[13px]">
                {r.title}
                {r.gameCategory && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.5px] text-bk-muted">
                    {r.gameCategory}
                  </span>
                )}
              </p>
              <p className="font-sans text-bk-body text-[12px]">{r.description}</p>
              <p className="font-sans text-bk-gold-light text-[11px] mt-1">
                {r.action === "point_deduction"
                  ? `Point deduction (−${r.penaltyPoints} pt${r.penaltyPoints === 1 ? "" : "s"})`
                  : r.action === "disqualification"
                    ? "Disqualification"
                    : "Warning"}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggleActive(r)}
                className={smallBtn}
              >
                {r.isActive ? "Hide" : "Unhide"}
              </button>
              <button type="button" disabled={busy} onClick={() => void remove(r.id)} className={smallBtn}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {!showNew ? (
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="font-sans text-bk-heading text-[12px] border border-bk-border px-3 py-1.5"
        >
          + New suggestion
        </button>
      ) : (
        <form onSubmit={create} className="bg-bk-surface border border-bk-border p-3 flex flex-col gap-2">
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={inputClass}
          />
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
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
                className={`${inputClass} w-24`}
              />
            )}
          </div>
          <input
            value={gameCategory}
            onChange={(e) => setGameCategory(e.target.value)}
            placeholder="Game category (optional, e.g. mobile) — blank shows for every game"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase tracking-[0.5px] py-2 disabled:opacity-50"
          >
            Save suggestion
          </button>
        </form>
      )}
    </section>
  );
}
