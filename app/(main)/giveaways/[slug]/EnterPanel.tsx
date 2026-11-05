"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import type { Eligibility } from "@/lib/services/giveaways";

export default function EnterPanel({
  giveawayId, slug, entered, eligibility, tournament,
}: {
  giveawayId: string; slug: string; entered: boolean; eligibility: Eligibility; verifiedOnly: boolean; tournament: { name: string; slug: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEntered, setJustEntered] = useState(false);

  async function enter() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/giveaways/${giveawayId}/enter`, { method: "POST" });
    setBusy(false);
    if (res.ok) { setJustEntered(true); return router.refresh(); }
    setError((await res.json().catch(() => ({}))).error?.message ?? "Something went wrong.");
  }

  const box = "mt-6 bg-bk-surface border border-bk-border px-4 py-4";
  if (entered || justEntered || (!eligibility.ok && eligibility.reason === "already_entered")) {
    return <div className={`${box} border-bk-teal/50`} role="status"><p className="font-sans font-bold text-[14px] text-bk-teal">You&apos;re in. Good luck!</p><p className="font-sans text-[12px] text-bk-muted mt-1">If you win, you&apos;ll get a notification.</p></div>;
  }
  if (eligibility.ok) {
    return (
      <div className={box}>
        <button type="button" onClick={enter} disabled={busy} className={buttonClass("primary", "md")}>{busy ? "Entering…" : "Enter this giveaway"}</button>
        {error && <p role="alert" className="text-bk-live text-[12px] font-sans mt-3">{error}</p>}
      </div>
    );
  }
  const r = eligibility.reason;
  return (
    <div className={box} role="status">
      {r === "login" && <p className="font-sans text-[13px] text-bk-body"><Link href={`/login?redirectTo=/giveaways/${slug}`} className="text-bk-gold-light underline">Log in</Link> to enter.</p>}
      {r === "not_verified" && (
        <>
          <p className="font-sans font-bold text-[14px] text-bk-heading">This giveaway is for verified members</p>
          <p className="font-sans text-[12px] text-bk-body mt-1">Verified means being on a paid plan (player, organizer or club). <Link href="/plans" className="text-bk-gold-light underline">Get verified first</Link>, then come back to enter.</p>
        </>
      )}
      {r === "tournament_required" && <p className="font-sans text-[13px] text-bk-body">Only players who took part in {tournament ? <Link href={`/tournaments/${tournament.slug}`} className="underline">{tournament.name}</Link> : "the linked tournament"} can enter.</p>}
      {r === "age_restricted" && <p className="font-sans text-[13px] text-bk-body">Cash prizes are for players 18 and over. Make sure your age is on your <Link href="/dashboard/profile" className="text-bk-gold-light underline">profile</Link>.</p>}
      {r === "host" && <p className="font-sans text-[13px] text-bk-muted">You run or help run this giveaway, so you can&apos;t enter it.</p>}
      {r === "closed" && <p className="font-sans text-[13px] text-bk-muted">Entries are closed. Winners will be drawn soon.</p>}
      {r === "not_started" && <p className="font-sans text-[13px] text-bk-muted">Entries open when the giveaway starts.</p>}
      {r === "unavailable" && <p className="font-sans text-[13px] text-bk-muted">This giveaway isn&apos;t open for entries.</p>}
    </div>
  );
}
