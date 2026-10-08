"use client";

import { useState } from "react";

interface TierSetting {
  id: string;
  tier: "D" | "C" | "B" | "A" | "S" | "National";
  scope: "world" | "region" | "country";
  scopeValue: string | null;
  minPrizePoolUsd: string; // Decimal comes over the wire as a string
  minRating: number | null;
  minWins: number | null;
  publishPath: "instant" | "admin_review" | "always_admin";
}

const TIERS: TierSetting["tier"][] = ["D", "C", "B", "A", "S", "National"];

// Blank editable row, keyed by a temp id so multiple new overrides across
// different tiers don't collide before they're saved.
function blankOverride(tier: TierSetting["tier"]): TierSetting {
  return {
    id: `new-${tier}-${Date.now()}`,
    tier,
    scope: "country",
    scopeValue: "",
    minPrizePoolUsd: "0",
    minRating: null,
    minWins: null,
    publishPath: "instant",
  };
}

export default function TierSettingsManager({
  initialSettings,
}: {
  initialSettings: TierSetting[];
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [drafts, setDrafts] = useState<Record<string, TierSetting>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draftFor(setting: TierSetting) {
    return drafts[setting.id] ?? setting;
  }

  function updateDraft(setting: TierSetting, patch: Partial<TierSetting>) {
    setDrafts((prev) => ({ ...prev, [setting.id]: { ...draftFor(setting), ...patch } }));
  }

  async function save(setting: TierSetting) {
    const draft = draftFor(setting);
    if (draft.scope !== "world" && !draft.scopeValue?.trim()) {
      setError("Country/region overrides need a name.");
      return;
    }

    setSavingId(setting.id);
    setError(null);
    const res = await fetch("/api/admin/tier-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: draft.tier,
        scope: draft.scope,
        scopeValue: draft.scope === "world" ? null : draft.scopeValue,
        minPrizePoolUsd: Number(draft.minPrizePoolUsd),
        minRating: draft.minRating,
        minWins: draft.minWins,
        publishPath: draft.publishPath,
      }),
    });
    setSavingId(null);

    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      return;
    }
    const saved: TierSetting = await res.json();
    setSettings((prev) => {
      const withoutOld = prev.filter((s) => s.id !== setting.id);
      return [...withoutOld, saved];
    });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[setting.id];
      return next;
    });
  }

  async function remove(setting: TierSetting) {
    if (setting.id.startsWith("new-")) {
      // Never saved — just drop the draft row.
      setSettings((prev) => prev.filter((s) => s.id !== setting.id));
      return;
    }
    if (!window.confirm(`Remove the ${setting.scopeValue} override for ${setting.tier}-tier?`))
      return;

    const res = await fetch(`/api/admin/tier-settings/${setting.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      return;
    }
    setSettings((prev) => prev.filter((s) => s.id !== setting.id));
  }

  const inputClass =
    "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2 h-[30px]";

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        Competitive tier ladder
      </p>
      <p className="font-sans text-bk-muted text-xs mb-3">
        Min prize pool is USD-equivalent — organizers entering another currency get it
        live-converted at creation time. Country/region overrides win over the world default.
      </p>

      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}

      <div className="flex flex-col gap-6">
        {TIERS.map((tier) => {
          const rows = settings.filter((s) => s.tier === tier);
          const worldRow = rows.find((r) => r.scope === "world");
          const overrideRows = rows.filter((r) => r.scope !== "world");

          return (
            <div key={tier}>
              <p className="font-mono text-bk-gold-light text-sm mb-2">{tier}-tier</p>
              <div className="flex flex-col gap-1.5">
                {worldRow && (
                  <SettingRow
                    setting={draftFor(worldRow)}
                    original={worldRow}
                    onChange={(patch) => updateDraft(worldRow, patch)}
                    onSave={() => save(worldRow)}
                    saving={savingId === worldRow.id}
                    inputClass={inputClass}
                  />
                )}
                {overrideRows.map((row) => (
                  <SettingRow
                    key={row.id}
                    setting={draftFor(row)}
                    original={row}
                    onChange={(patch) => updateDraft(row, patch)}
                    onSave={() => save(row)}
                    onRemove={() => remove(row)}
                    saving={savingId === row.id}
                    inputClass={inputClass}
                  />
                ))}
                {settings
                  .filter((s) => s.tier === tier && s.id.startsWith("new-"))
                  .map((row) => (
                    <SettingRow
                      key={row.id}
                      setting={draftFor(row)}
                      original={row}
                      onChange={(patch) => updateDraft(row, patch)}
                      onSave={() => save(row)}
                      onRemove={() => remove(row)}
                      saving={savingId === row.id}
                      inputClass={inputClass}
                    />
                  ))}
              </div>
              <button
                type="button"
                onClick={() => setSettings((prev) => [...prev, blankOverride(tier)])}
                className="text-bk-muted font-sans text-[11px] uppercase tracking-[0.5px] underline mt-1.5"
              >
                + Add country/region override
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SettingRow({
  setting,
  original,
  onChange,
  onSave,
  onRemove,
  saving,
  inputClass,
}: {
  setting: TierSetting;
  original: TierSetting;
  onChange: (patch: Partial<TierSetting>) => void;
  onSave: () => void;
  onRemove?: () => void;
  saving: boolean;
  inputClass: string;
}) {
  const isNew = setting.id.startsWith("new-");
  const dirty = isNew || JSON.stringify(setting) !== JSON.stringify(original);

  return (
    <div className="bg-bk-surface border border-bk-border p-2.5 flex flex-wrap items-center gap-2">
      {setting.scope === "world" ? (
        <span className="w-[110px] font-sans text-[11px] uppercase tracking-[0.5px] text-bk-muted">
          World default
        </span>
      ) : (
        <>
          <select
            value={setting.scope}
            onChange={(e) => onChange({ scope: e.target.value as TierSetting["scope"] })}
            className={inputClass}
          >
            <option value="country">Country</option>
            <option value="region">Region</option>
          </select>
          <input
            value={setting.scopeValue ?? ""}
            onChange={(e) => onChange({ scopeValue: e.target.value })}
            placeholder="e.g. Pakistan"
            className={`${inputClass} w-[120px]`}
          />
        </>
      )}

      <label className="flex items-center gap-1 font-sans text-[11px] text-bk-muted">
        Floor (USD)
        <input
          type="number"
          min={0}
          value={setting.minPrizePoolUsd}
          onChange={(e) => onChange({ minPrizePoolUsd: e.target.value })}
          className={`${inputClass} w-[80px]`}
        />
      </label>

      {setting.tier === "National" ? (
        <label className="flex items-center gap-1 font-sans text-[11px] text-bk-muted">
          Min S-tier wins
          <input
            type="number"
            min={0}
            value={setting.minWins ?? ""}
            onChange={(e) => onChange({ minWins: e.target.value ? Number(e.target.value) : null })}
            className={`${inputClass} w-[60px]`}
          />
        </label>
      ) : (
        <label className="flex items-center gap-1 font-sans text-[11px] text-bk-muted">
          Min rating
          <input
            type="number"
            min={0}
            value={setting.minRating ?? ""}
            onChange={(e) =>
              onChange({ minRating: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="none"
            className={`${inputClass} w-[60px]`}
          />
        </label>
      )}

      <select
        value={setting.publishPath}
        onChange={(e) => onChange({ publishPath: e.target.value as TierSetting["publishPath"] })}
        className={inputClass}
      >
        <option value="instant">Instant</option>
        <option value="admin_review">Admin review</option>
        <option value="always_admin">Always admin</option>
      </select>

      <div className="ml-auto flex items-center gap-2">
        {dirty && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[10px] uppercase tracking-[0.5px] px-2 py-1 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-bk-live font-sans text-[10px] uppercase tracking-[0.5px] underline"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
