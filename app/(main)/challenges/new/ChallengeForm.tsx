"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import { POSTER_TERMS } from "@/lib/challenge-terms";

interface Role {
  type: "player" | "club" | "organizer";
  name: string;
  planName: string;
  used: number;
  monthlyLimit: number | null;
  prizeCapUsd: number | null;
}

const ROLE_LABEL = { player: "Myself (player)", club: "My club", organizer: "My organization" } as const;
const field = "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";
const label = "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";

function Field({ name, error, children }: { name: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className={label}>{name}</label>
      {children}
      {error && <p className="mt-1 font-sans text-[12px] text-bk-live">{error}</p>}
    </div>
  );
}

export default function ChallengeForm({
  roles,
  games,
}: {
  roles: Role[];
  games: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState({
    postAs: roles[0].type as string,
    title: "", description: "", gameId: "", entrantType: "either", minRating: "",
    slots: "1", maxApplicants: "10", openDays: "7", completeWithinDays: "7",
    prizeType: "cash", prizeDescription: "", cashAmount: "", cashCurrency: "PKR",
    prizeEstimatedUsd: "", payoutMethod: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const role = roles.find((r) => r.type === f.postAs) ?? roles[0];
  const left = role.monthlyLimit === null ? null : Math.max(0, role.monthlyLimit - role.used);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);
    const res = await fetch("/api/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, acceptTerms }),
    });
    const body = await res.json();
    if (!res.ok) {
      if (body.error.fields) setErrors(body.error.fields);
      setMessage(body.error.message);
      setBusy(false);
      return;
    }
    router.push(`/challenges/${body.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="bg-bk-surface border border-bk-border p-6">
      <Field name="Post as" error={errors.postAs}>
        <select value={f.postAs} onChange={set("postAs")} className={field}>
          {roles.map((r) => (
            <option key={r.type} value={r.type}>{ROLE_LABEL[r.type]} — {r.name}</option>
          ))}
        </select>
        <p className="mt-1.5 font-sans text-[12px] text-bk-muted">
          {role.planName}:{" "}
          {left === null ? "unlimited challenges" : `${left} of ${role.monthlyLimit} left this month`}
          {" · "}
          {role.prizeCapUsd === null ? "no prize cap" : `prizes up to $${role.prizeCapUsd}`}
          {(left === 0 || role.prizeCapUsd !== null) && (
            <> · <Link href="/plans" className="text-bk-gold-light underline">Upgrade</Link></>
          )}
        </p>
      </Field>

      <Field name="Title" error={errors.title}>
        <input value={f.title} onChange={set("title")} className={field} placeholder="Beat our squad in a 4v4" />
      </Field>
      <Field name="Game" error={errors.gameId}>
        <select value={f.gameId} onChange={set("gameId")} className={field}>
          <option value="">Select…</option>
          {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <Field name="What has to be done to win" error={errors.description}>
        <textarea value={f.description} onChange={set("description")} rows={4} className={`${field} h-auto py-2`}
          placeholder="Rules, map, mode, number of rounds, what counts as a win…" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field name="Who can take it on" error={errors.entrantType}>
          <select value={f.entrantType} onChange={set("entrantType")} className={field}>
            <option value="either">Players or teams</option>
            <option value="player">Solo players</option>
            <option value="team">Teams</option>
          </select>
        </Field>
        <Field name="Minimum rating (optional)" error={errors.minRating}>
          <input type="number" min={0} value={f.minRating} onChange={set("minRating")} className={field} placeholder="e.g. 1200" />
        </Field>
        <Field name="Challengers you'll pick" error={errors.slots}>
          <input type="number" min={1} max={10} value={f.slots} onChange={set("slots")} className={field} />
        </Field>
        <Field name="Max applications" error={errors.maxApplicants}>
          <input type="number" min={1} max={50} value={f.maxApplicants} onChange={set("maxApplicants")} className={field} />
        </Field>
        <Field name="Applications open for (days)" error={errors.openDays}>
          <input type="number" min={1} max={30} value={f.openDays} onChange={set("openDays")} className={field} />
        </Field>
        <Field name="Time to complete (days)" error={errors.completeWithinDays}>
          <input type="number" min={1} max={60} value={f.completeWithinDays} onChange={set("completeWithinDays")} className={field} />
        </Field>
      </div>

      <p className="font-sans font-bold text-[13px] text-bk-heading mt-4 mb-3 pb-2 border-b border-bk-border">Prize</p>
      <Field name="Prize type" error={errors.prizeType}>
        <select value={f.prizeType} onChange={set("prizeType")} className={field}>
          <option value="cash">Cash</option>
          <option value="in_game">In-game currency or items (UC, RP…)</option>
          <option value="reward">Other reward (e.g. free entry to my scrim)</option>
        </select>
      </Field>
      {f.prizeType === "cash" && (
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <Field name="Amount" error={errors.cashAmount}>
            <input type="number" min={1} step="any" value={f.cashAmount} onChange={set("cashAmount")} className={field} />
          </Field>
          <Field name="Currency" error={errors.cashCurrency}>
            <select value={f.cashCurrency} onChange={set("cashCurrency")} className={field}>
              {SUPPORTED_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      )}
      {f.prizeType === "in_game" && (
        <Field name="Estimated value in US dollars" error={errors.prizeEstimatedUsd}>
          <input type="number" min={1} step="any" value={f.prizeEstimatedUsd} onChange={set("prizeEstimatedUsd")} className={field} />
        </Field>
      )}
      <Field name="Describe the prize" error={errors.prizeDescription}>
        <input value={f.prizeDescription} onChange={set("prizeDescription")} className={field} placeholder="600 UC, or Rs 5,000, or free entry to our league" />
      </Field>
      <Field name="How you'll pay or deliver it" error={errors.payoutMethod}>
        <input value={f.payoutMethod} onChange={set("payoutMethod")} className={field} placeholder="JazzCash or bank transfer in PKR" />
      </Field>

      <div className="mb-4 bg-bk-bg border border-bk-border p-3">
        <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-2">Before you post</p>
        <ul className="list-disc pl-5 space-y-1 font-sans text-[12px] text-bk-body">
          {POSTER_TERMS.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <label className="mt-3 flex items-start gap-2 font-sans text-[13px] text-bk-heading">
          <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1" />
          I have read and accept these terms
        </label>
        {errors.acceptTerms && <p className="mt-1 font-sans text-[12px] text-bk-live">{errors.acceptTerms}</p>}
      </div>

      {message && <p className="font-sans text-[12px] text-bk-live mb-3">{message}</p>}
      <button disabled={busy} className="w-full bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-3 disabled:opacity-50">
        {busy ? "Posting…" : "Post challenge"}
      </button>
    </form>
  );
}
