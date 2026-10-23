import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listPayoutsForPlayer } from "@/lib/services/organizer-trust";
import PayoutResponse from "./PayoutResponse";

export default async function MyPayoutsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/payouts");

  const payouts = await listPayoutsForPlayer(user.id);

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Prize payouts</h1>
      <p className="font-sans text-bk-body text-[13px] mb-6">
        Organizers pay prizes directly. Tell us whether you received yours, so other players can trust the organizer.
      </p>
      {payouts.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">No prizes to confirm.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {payouts.map((p) => (
            <div key={p.id} className="bg-bk-surface border border-bk-border p-4">
              <p className="font-sans text-sm text-bk-heading font-bold">
                {p.tournament.name}
                {p.award && <span className="font-normal text-bk-muted"> · {p.award.name} award</span>}
              </p>
              <p className="font-sans text-[12px] text-bk-muted">
                Paid by {p.tournament.organizer.orgName} ·{" "}
                <span className="font-mono text-bk-heading">
                  {[Number(p.amount) > 0 ? `${Number(p.amount).toLocaleString()} ${p.currency}` : null, p.description]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
              </p>
              <PayoutResponse payoutId={p.id} status={p.status} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
