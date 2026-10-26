"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEATURE_ROWS, type FeatureFlags, type FeatureKey } from "@/lib/feature-flags-shared";
import { Panel } from "@/components/ui/Panel";

// One switch per feature. Flipping saves straight away. Risky ones ask first.
export default function FeatureSwitches({ initial }: { initial: FeatureFlags }) {
  const router = useRouter();
  const [flags, setFlags] = useState(initial);
  const [busy, setBusy] = useState<FeatureKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function flip(key: FeatureKey, next: boolean) {
    const row = FEATURE_ROWS.find((r) => r.key === key)!;
    if (!next && row.warning && !confirm(`${row.warning}\n\nTurn "${row.label}" off?`)) return;
    setBusy(key);
    setError(null);
    const res = await fetch("/api/admin/features", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: next }),
    });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error?.message ?? "Couldn't save.");
    setFlags(await res.json());
    router.refresh();
  }

  return (
    <section>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Features</p>
      <p className="font-sans text-bk-muted text-xs mb-3">
        Switch features on or off. Turning one off stops it applying to <em>new</em> things; promises already made to players
        (locked events, held deposits, consents already given, running challenges) are kept.
      </p>
      {error && <p className="font-sans text-xs text-bk-live mb-2">{error}</p>}
      <div className="space-y-2">
        {FEATURE_ROWS.map((row) => {
          const on = flags[row.key];
          return (
            <Panel key={row.key} className="p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy === row.key}
                  onChange={(e) => flip(row.key, e.target.checked)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="font-sans text-[13px] text-bk-heading font-bold">
                    {row.label}{" "}
                    <span className={`font-normal text-[11px] uppercase tracking-[0.8px] ${on ? "text-bk-teal" : "text-bk-muted"}`}>
                      {on ? "On" : "Off"}
                    </span>
                  </span>
                  <span className="block font-sans text-[12px] text-bk-body mt-0.5">{on ? row.on : row.off}</span>
                </span>
              </label>
            </Panel>
          );
        })}
        <Panel className="p-3">
          <p className="font-sans text-[13px] text-bk-heading font-bold">
            Security deposit{" "}
            <span className={`font-normal text-[11px] uppercase tracking-[0.8px] ${flags.deposit ? "text-bk-teal" : "text-bk-muted"}`}>
              {flags.deposit ? "On" : "Off"}
            </span>
          </p>
          <p className="font-sans text-[12px] text-bk-body mt-0.5">
            Switched on and off in the plan settings below, together with the deposit amount on each organizer plan.
          </p>
        </Panel>
      </div>
    </section>
  );
}
