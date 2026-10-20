"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { NoShowPolicy } from "./PenaltyControls";

const inputClass =
  "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]";

// The organizer decides what a no-show costs. It applies automatically when a
// no-show is marked at on-site check-in, and is the penalty used by "Report
// no-show" (the organizer can still choose differently for a single case).
export default function NoShowPolicyPanel({ tournamentId, initial }: { tournamentId: string; initial: NoShowPolicy }) {
  const router = useRouter();
  const [penalty, setPenalty] = useState(initial.penalty);
  const [points, setPoints] = useState(String(initial.points ?? ""));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/no-show-policy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ penalty, points: penalty === "point_deduction" ? Number(points) : null }),
    });
    setBusy(false);
    if (!res.ok) return setMsg({ ok: false, text: (await res.json()).error?.message ?? "Couldn't save." });
    setMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  return (
    <Panel as="section" className="mt-10 p-4">
      <p className="font-sans font-medium text-bk-heading text-sm">No-show penalty</p>
      <p className="font-sans text-[12px] text-bk-muted mt-1">
        You decide what happens to an entry that doesn&apos;t show up. It applies automatically when a no-show is marked at
        on-site check-in, and it&apos;s the penalty co-host institutes apply when they report one. Cheating is always
        disqualification.
      </p>
      <div className="flex flex-wrap gap-2 mt-3 items-center">
        <select value={penalty} onChange={(e) => setPenalty(e.target.value as NoShowPolicy["penalty"])} className={inputClass}>
          <option value="none">No automatic penalty</option>
          <option value="warning">Warning</option>
          <option value="point_deduction">Point deduction</option>
          <option value="disqualification">Disqualification</option>
        </select>
        {penalty === "point_deduction" && (
          <input
            inputMode="numeric"
            value={points}
            onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))}
            placeholder="Points"
            className={`${inputClass} w-[96px]`}
          />
        )}
        <Button disabled={busy} onClick={save}>
          Save
        </Button>
        {msg && <span className={`font-sans text-[12px] ${msg.ok ? "text-bk-muted" : "text-bk-live"}`}>{msg.text}</span>}
      </div>
      {penalty === "point_deduction" && (
        <p className="font-sans text-[11px] text-bk-muted mt-2">
          Deductions are recorded and shown next to the entry. You apply them when you enter standings.
        </p>
      )}
    </Panel>
  );
}
