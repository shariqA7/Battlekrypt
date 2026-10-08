"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Props {
  challengeId: string;
  existing: { status: string; kind: string; entrantName: string; message: string | null } | null;
  player: { rating: number; blocker: string | null } | null;
  teams: { id: string; name: string; rating: number; blocker: string | null }[];
}

const STATUS_TEXT: Record<string, string> = {
  applied: "Your application is in. The poster will pick from everyone who applied.",
  selected: "You were chosen! Complete the challenge before the deadline.",
  not_selected: "The poster picked other challengers this time.",
  withdrawn: "You withdrew your application.",
};

export default function ApplyPanel({ challengeId, existing, player, teams }: Props) {
  const router = useRouter();
  const options = [
    ...(player ? [{ key: "player", label: `Myself (rating ${player.rating})`, blocker: player.blocker }] : []),
    ...teams.map((t) => ({ key: t.id, label: `${t.name} (team rating ${t.rating})`, blocker: t.blocker })),
  ];
  const firstOk = options.find((o) => !o.blocker)?.key ?? options[0]?.key ?? "";
  const [choice, setChoice] = useState(firstOk);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function apply() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/challenges/${challengeId}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(choice === "player" ? { kind: "player", message } : { kind: "team", clubTeamId: choice, message }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      if (error.code === "plan_required") router.push("/plans");
    } else router.refresh();
    setBusy(false);
  }

  async function withdraw() {
    setBusy(true);
    const res = await fetch(`/api/challenges/${challengeId}/applications`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error.message);
    else router.refresh();
    setBusy(false);
  }

  if (existing && existing.status !== "withdrawn" && existing.status !== "not_selected") {
    return (
      <div className="bg-bk-surface border border-bk-border p-4">
        <p className="font-sans font-medium text-bk-heading text-sm">Applied as {existing.entrantName}</p>
        <p className="font-sans text-[13px] text-bk-body mt-1">{STATUS_TEXT[existing.status]}</p>
        {existing.status === "applied" && (
          <button disabled={busy} onClick={withdraw} className="mt-3 font-sans text-[12px] text-bk-live underline disabled:opacity-50">
            Withdraw application
          </button>
        )}
        {error && <p className="mt-2 font-sans text-[12px] text-bk-live">{error}</p>}
      </div>
    );
  }

  const selected = options.find((o) => o.key === choice);

  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      {existing?.status === "not_selected" && <p className="font-sans text-[12px] text-bk-muted mb-3">{STATUS_TEXT.not_selected}</p>}
      {options.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-body">
          You need a player profile, or a club with a team in this game, to apply.{" "}
          <Link href="/club/dashboard" className="text-bk-gold-light underline">Your club</Link>
        </p>
      ) : (
        <>
          <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1.5">Apply as</label>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px] mb-3">
            {options.map((o) => (
              <option key={o.key} value={o.key}>{o.label}{o.blocker ? " — can't apply" : ""}</option>
            ))}
          </select>
          {selected?.blocker && <p className="font-sans text-[12px] text-bk-live mb-3">{selected.blocker}</p>}
          <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1.5">Note to the poster (optional)</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} rows={2}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 py-2 mb-3" placeholder="Why you're a good pick" />
          {error && <p className="font-sans text-[12px] text-bk-live mb-3">{error}</p>}
          <button disabled={busy || !!selected?.blocker} onClick={apply}
            className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-5 py-2.5 disabled:opacity-50">
            {busy ? "Applying…" : "Apply"}
          </button>
        </>
      )}
    </div>
  );
}
