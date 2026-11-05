import { requireAdminPage } from "@/lib/admin-page";
import { getGiveawaySettings, listGiveawaysForAdmin } from "@/lib/services/giveaways";
import { Panel, Stat } from "@/components/admin/charts";
import { SectionHeading } from "@/components/ui/Panel";
import GiveawayForm from "@/components/giveaways/GiveawayForm";
import GiveawayManager from "@/components/giveaways/GiveawayManager";
import GiveawaySettings from "./GiveawaySettings";

export default async function AdminGiveawaysPage() {
  await requireAdminPage("giveaways");
  const [items, settings] = await Promise.all([listGiveawaysForAdmin(), getGiveawaySettings()]);
  const count = (s: string) => items.filter((g) => g.status === s).length;
  const toDraw = items.filter((g) => g.phase === "closed").length;
  const toDeliver = items.reduce((n, g) => n + g.winners.filter((w) => w.status === "details_submitted" || w.status === "disputed").length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SectionHeading>Giveaways</SectionHeading>
          <p className="font-sans text-[13px] text-bk-body pl-[19px]">Run giveaways for brands and the community, and approve the bigger ones organizers start. Switch the feature on or off in Settings → Features.</p>
        </div>
        <GiveawayForm mode="admin" defaultVerifiedOnly={settings.verifiedOnly} reviewAboveUsd={settings.reviewAboveUsd} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Waiting for review" value={count("pending_review")} />
        <Stat label="Live" value={count("active")} />
        <Stat label="Ready to draw" value={toDraw} />
        <Stat label="Prizes to deliver" value={toDeliver} hint="winners who sent their details" />
      </div>

      <Panel title="All giveaways">
        <GiveawayManager items={items} mode="admin" />
      </Panel>

      <Panel title="Settings">
        <GiveawaySettings verifiedOnly={settings.verifiedOnly} reviewAboveUsd={settings.reviewAboveUsd} claimDays={settings.claimDays} />
      </Panel>
    </div>
  );
}
