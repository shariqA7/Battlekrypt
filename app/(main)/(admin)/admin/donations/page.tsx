import { requireAdminPage } from "@/lib/admin-page";
import { getDonationSettings, getFundSummary, listAllocations, listCampaignsAdmin, listPendingDonations, listRecentDonations } from "@/lib/services/donations";
import { formatMoney } from "@/lib/money";
import { Panel, Stat } from "@/components/admin/charts";
import { SectionHeading } from "@/components/ui/Panel";
import DonationsReview from "./DonationsReview";
import CampaignsPanel from "./CampaignsPanel";
import AllocatePanel from "./AllocatePanel";
import DonationSettings from "./DonationSettings";

const money = (r: Record<string, number>) => {
  const parts = Object.entries(r).filter(([, v]) => v !== 0).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
};
const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default async function AdminDonationsPage() {
  await requireAdminPage("donations");
  const [fund, pending, campaigns, allocations, recent, settings] = await Promise.all([
    getFundSummary(),
    listPendingDonations(),
    listCampaignsAdmin(),
    listAllocations(15),
    listRecentDonations(10),
    getDonationSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Donations</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">People give to the community fund. You approve each donation and decide how the fund is used. Switch donations on or off in Settings → Features.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Raised" value={money(fund.raised)} hint="approved donations" />
        <Stat label="Used" value={money(fund.allocated)} hint="recorded allocations" />
        <Stat label="In the fund" value={money(fund.balance)} />
        <Stat label="To review" value={pending.length} />
      </div>

      <Panel title="Waiting for review">
        <DonationsReview items={pending} />
      </Panel>

      <Panel title="Campaigns">
        <CampaignsPanel campaigns={campaigns} />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Use the fund">
          <AllocatePanel campaigns={campaigns.filter((c) => c.status !== "draft").map((c) => ({ id: c.id, title: c.title, currency: c.currency }))} />
        </Panel>
        <Panel title="Recent uses">
          {allocations.length === 0 ? (
            <p className="font-sans text-[12px] text-bk-muted">Nothing recorded yet.</p>
          ) : (
            <ul className="font-sans text-[12px] text-bk-body space-y-2">
              {allocations.map((a) => (
                <li key={a.id}>
                  <span className="text-bk-heading">{formatMoney(a.amount, a.currency)}</span> · {a.purpose}
                  <span className="text-bk-muted"> · {a.tournament ?? a.campaign ?? "General fund"} · {date(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Settings">
          <DonationSettings instructions={settings.instructions ?? ""} verifiedOnly={settings.verifiedOnly} />
        </Panel>
        <Panel title="Recent decisions">
          {recent.length === 0 ? (
            <p className="font-sans text-[12px] text-bk-muted">No donations reviewed yet.</p>
          ) : (
            <ul className="font-sans text-[12px] text-bk-body space-y-1.5">
              {recent.map((d) => (
                <li key={d.id}>
                  <span className={d.status === "approved" ? "text-bk-teal" : "text-bk-live"}>{d.status}</span> · {formatMoney(d.amount, d.currency)} · {d.donor}
                  <span className="text-bk-muted"> · {d.campaign ?? "General fund"} · {date(d.at)}{d.note ? ` · ${d.note}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
