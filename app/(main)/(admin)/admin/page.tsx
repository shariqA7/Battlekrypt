import { requireAdminPage } from "@/lib/admin-page";
import { DASH_RANGES, getDashboard, parseDashRange } from "@/lib/services/admin-analytics";
import { getAttentionCounts } from "@/lib/services/admin-attention";
import { SectionHeading } from "@/components/ui/Panel";
import AdminDashboard from "@/components/admin/dashboard/AdminDashboard";
import AttentionCard from "@/components/admin/dashboard/AttentionCard";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireAdminPage();
  const range = parseDashRange((await searchParams).range);
  const [initial, attention] = await Promise.all([getDashboard(range), getAttentionCounts()]);

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Dashboard</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">What is waiting on you, and how the platform is doing.</p>
      </div>

      {/* Right-now queues: not affected by the time range */}
      <section aria-label="Needs attention" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-sans font-bold text-bk-heading text-base">Needs attention</p>
          <span className={`font-mono text-[11px] px-2 py-0.5 ${attention.total > 0 ? "bg-bk-amber/15 text-bk-amber" : "bg-bk-teal/15 text-bk-teal"}`}>
            {attention.total > 0 ? `${attention.total} waiting` : "all clear"}
          </span>
          <span className="font-sans text-[11px] text-bk-muted">right now, whatever the period</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AttentionCard index={0} href="/admin/approvals/plan-payments" icon="payments" label="Plan payments" count={attention.items.planPayments} />
          <AttentionCard index={1} href="/admin/approvals/identity" icon="idPhotos" label="Identity checks" count={attention.items.identity} />
          <AttentionCard index={2} href="/admin/approvals/organizations" icon="organizations" label="Organizer applications" count={attention.items.organizers} />
          <AttentionCard index={3} href="/admin/approvals/clubs" icon="clubs" label="Club upgrades & name claims" count={attention.items.clubs} />
          <AttentionCard index={4} href="/admin/approvals/tournaments" icon="tournaments" label="Tournament reviews" count={attention.items.tournamentReviews} />
          <AttentionCard index={5} href="/admin/approvals/games" icon="games" label="Game requests" count={attention.items.games} />
          <AttentionCard index={6} href="/admin/approvals/challenges" icon="review" label="Challenge review" count={attention.items.challengeReview} />
          <AttentionCard index={7} href="/admin/approvals/disputes" icon="disputes" label="Challenge disputes" count={attention.items.challengeDisputes} />
          <AttentionCard index={8} href="/admin/approvals/reports" icon="reports" label="Reports & flags" count={attention.items.challengeIntegrity} />
          <AttentionCard index={9} href="/admin/approvals/consent" icon="consent" label="Parental-consent cases" count={attention.items.consent} />
          <AttentionCard index={10} href="/admin/institutions" icon="institutions" label="Institutions to verify" count={attention.items.institutions} />
          <AttentionCard index={11} href="/admin/change-requests" icon="changeRequests" label="Tournament change requests" count={attention.items.changeRequests} />
          <AttentionCard index={13} href="/admin/reports" icon="reports" label="Player reports" count={attention.items.playerReports} />
          <AttentionCard index={14} href="/admin/invoices?filter=proof_submitted" icon="payments" label="Invoice payments to check" count={attention.items.invoices} />
        </div>
      </section>

      <AdminDashboard initial={initial} ranges={DASH_RANGES.map(({ key, label }) => ({ key, label }))} />
    </div>
  );
}
