import { requireAdminPage } from "@/lib/admin-page";
import { listChangeRequestsForAdmin } from "@/lib/services/change-requests";
import { conditionsToLines } from "@/lib/entry-conditions";
import { SectionHeading } from "@/components/ui/Panel";
import { ordinal } from "@/lib/services/prize-tiers";
import ChangeRequestsManager from "./ChangeRequestsManager";

export default async function AdminChangeRequestsPage() {
  await requireAdminPage();
  const rows = await listChangeRequestsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Change requests</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Organizers can&apos;t change the prize pool, cancel, or change entry conditions on a paid or prized event once players
          have registered. Approve only genuine cases: approving applies the change and tells every registered player.
          An approved cancellation of a paid event obliges the organizer to refund players and confirm it.
        </p>
      </div>
      <ChangeRequestsManager
        rows={rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          details: r.details,
          status: r.status,
          adminNote: r.adminNote,
          createdAt: r.createdAt.toISOString(),
          tournament: r.tournament.name,
          tournamentStatus: r.tournament.status,
          paid: r.tournament.entryType === "paid",
          pool:
            r.tournament.prizePoolAmount != null
              ? `${Number(r.tournament.prizePoolAmount).toLocaleString()} ${r.tournament.prizePoolCurrency ?? ""}`
              : null,
          organizer: `${r.tournament.organizer.orgName} (${r.tournament.organizer.user.email ?? "no email"})`,
          registered: r.registered,
          proposed:
            r.kind === "prize_pool"
              ? (() => {
                  const p = (r.payload ?? {}) as {
                    amount?: number;
                    tiers?: { from: number; to: number; amount: number }[];
                    awards?: { name: string; cashAmount: number | null; prizeText: string | null }[];
                  };
                  const cur = r.tournament.prizePoolCurrency ?? "";
                  const places = (p.tiers ?? []).map((t) => `${t.from === t.to ? ordinal(t.from) : `${ordinal(t.from)}–${ordinal(t.to)}`}: ${t.amount.toLocaleString()} ${cur}${t.from === t.to ? "" : " each"}`);
                  const awards = (p.awards ?? []).map((a) => `${a.name}: ${[a.cashAmount != null ? `${a.cashAmount.toLocaleString()} ${cur}` : null, a.prizeText].filter(Boolean).join(" + ")}`);
                  return [`New prize pool: ${Number(p.amount ?? 0).toLocaleString()} ${cur}`, ...places, ...(awards.length ? ["Awards:", ...awards] : [])].join("\n");
                })()
              : r.kind === "conditions"
                ? `New conditions:\n${conditionsToLines((r.payload as { conditions?: unknown } | null)?.conditions) || "(none)"}`
                : null,
        }))}
      />
    </div>
  );
}
