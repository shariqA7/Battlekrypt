"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import LocalDate from "@/components/ui/LocalDate";
import { CONFIRM_PHRASE, type Blocker } from "@/lib/account-deletion";

type Props =
  | { state: "none"; blockers: Blocker[] }
  | { state: "scheduled"; dueAtIso: string; daysLeft: number };

export default function AccountDeletion(props: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<Blocker[]>(props.state === "none" ? props.blockers : []);

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/deletion", { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ confirm: typed }) : undefined });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      if (Array.isArray(data.blockers) && data.blockers.length) setBlockers(data.blockers);
      return setError(data?.error?.message ?? "Something went wrong.");
    }
    setTyped("");
    router.refresh();
  }

  if (props.state === "scheduled") {
    return (
      <div className="border border-bk-amber/50 bg-bk-surface p-4 space-y-3">
        <p className="font-sans font-bold text-[14px] text-bk-heading">Your account is scheduled for deletion</p>
        <p className="font-sans text-[13px] text-bk-body">
          It will be deleted on <span className="font-mono"><LocalDate iso={props.dueAtIso} format="long" /></span> ({props.daysLeft} day{props.daysLeft === 1 ? "" : "s"} left).
          Until then you can still use your account and cancel.
        </p>
        <button type="button" disabled={busy} onClick={() => call("DELETE")} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[13px] px-5 min-h-[44px] disabled:opacity-50">
          Cancel the deletion
        </button>
        {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="font-sans text-[13px] text-bk-body space-y-2">
        <p>Deleting your account removes your name, contact details, birth date, payout details, ID photos and uploaded files, and signs you out for good. You get 14 days to change your mind.</p>
        <p>We keep what we are required to keep, such as payment and invoice records, but without your name. Your tournament results and ratings stay under &quot;Deleted player&quot;. This can&apos;t be undone after the 14 days.</p>
      </div>

      {blockers.length > 0 ? (
        <div className="border border-bk-border bg-bk-surface p-4">
          <p className="font-sans font-bold text-[13px] text-bk-heading mb-2">Before you can delete your account</p>
          <ul className="list-disc pl-5 space-y-1 font-sans text-[13px] text-bk-body">
            {blockers.map((b) => <li key={b.kind}>{b.message}</li>)}
          </ul>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="font-sans text-[12px] text-bk-muted">Type <span className="font-mono text-bk-heading">{CONFIRM_PHRASE}</span> to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 w-full max-w-sm bg-bk-bg border border-bk-border px-3 min-h-[44px] font-mono text-[14px] text-bk-heading" />
          </label>
          <button type="button" disabled={busy || !typed.trim()} onClick={() => call("POST")} className="border border-bk-live text-bk-live font-sans font-bold text-[13px] px-5 min-h-[44px] disabled:opacity-50">
            Delete my account
          </button>
        </div>
      )}
      {error && <p role="alert" className="font-sans text-[12px] text-bk-live">{error}</p>}
    </div>
  );
}
