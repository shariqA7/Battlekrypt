import { listPrizePayees } from "@/lib/services/payout-methods";
import { Panel } from "@/components/ui/Panel";

// Who to pay, per prize position. Prizes won by a player under 18 are paid to their
// parent or guardian; the text says so. Only rendered for the tournament's own organizer.
export default async function PrizePayees({ tournamentId }: { tournamentId: string }) {
  const rows = await listPrizePayees(tournamentId);
  if (rows.length === 0) return null;

  return (
    <Panel className="mb-8 p-4">
      <p className="font-sans font-bold text-bk-heading text-base mb-1">Prize payees</p>
      <p className="font-sans text-[12px] text-bk-muted mb-4">
        Pay exactly as written. If the winner is under 18 it is their parent or guardian&apos;s account. Don&apos;t pay the player.
      </p>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.registrationId} className="border-t border-bk-border pt-3 first:border-t-0 first:pt-0">
            <p className="font-sans text-[13px] text-bk-heading">
              <strong>#{r.placement}</strong> {r.entrant}: {r.amount} {r.currency ?? ""}{r.isTeam ? " per team" : ""}
            </p>
            {r.payees.map((p, i) => (
              <div key={i} className="mt-1.5">
                {r.isTeam && <p className="font-sans text-[11px] uppercase tracking-[0.6px] text-bk-muted">{p.name}</p>}
                {p.text ? (
                  <pre className="font-sans text-[12px] text-bk-body whitespace-pre-wrap break-words">{p.text}</pre>
                ) : (
                  <p className="font-sans text-[12px] text-bk-amber">No payment details on file yet. Ask {p.name} to add them in profile settings (or their parent or guardian, if under 18).</p>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
