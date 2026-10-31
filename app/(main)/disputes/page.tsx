import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyDisputes } from "@/lib/services/payment-disputes";
import { disputeKindLabel, disputeStateLabel } from "@/lib/payment-disputes";
import { Badge } from "@/components/ui/Badge";
import LocalDate from "@/components/ui/LocalDate";

export default async function MyDisputesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/disputes");
  const disputes = await listMyDisputes(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Payment disputes</h1>
      <p className="font-sans text-bk-muted text-[12px] mb-6">Cases about an entry fee, as the player who paid or the organizer who received it.</p>
      {disputes.length === 0 ? (
        <p className="font-sans text-bk-body text-[13px]">No cases yet. You can open one from a paid entry on your dashboard.</p>
      ) : (
        <ul className="space-y-2">
          {disputes.map((d) => {
            const s = disputeStateLabel(d);
            return (
              <li key={d.id}>
                <Link href={`/disputes/${d.id}`} className="block bg-bk-surface border border-bk-border p-4 hover:border-bk-gold-from">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-sans text-[11px] uppercase tracking-[1px] text-bk-muted">{d.role === "payer" ? "You paid" : "You're the organizer"}</span>
                    <Badge tone={s.tone === "muted" ? "neutral" : s.tone} className="ml-auto">{s.label}</Badge>
                  </div>
                  <p className="font-sans font-bold text-bk-heading text-[14px]">{d.tournamentName}</p>
                  <p className="font-sans text-bk-body text-[12px]">{disputeKindLabel(d.kind)}</p>
                  <p className="font-mono text-bk-muted text-[11px] mt-1"><LocalDate iso={d.createdAt.toISOString()} format="long" /></p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
