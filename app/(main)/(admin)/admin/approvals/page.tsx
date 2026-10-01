import { requireAdminPage } from "@/lib/admin-page";
import {
  listPendingOrganizers,
  listPendingGameRequests,
  listFlaggedTournaments,
} from "@/lib/services/tournaments";
import { listPendingClubs } from "@/lib/services/clubs";
import { listAllSuggestedRules } from "@/lib/services/rules";
import { listPendingApplications } from "@/lib/services/org-applications";
import { listPendingClaims } from "@/lib/services/club-name-claims";
import { listActiveBans } from "@/lib/services/bans";
import AdminQueues from "../AdminQueues";
import SuggestedRulesManager from "../SuggestedRulesManager";
import OrgApplications from "../OrgApplications";
import NameClaims from "../NameClaims";
import PlanRequestsQueue from "../PlanRequestsQueue";
import { listPendingPlanRequests } from "@/lib/services/plan-requests";

export default async function AdminApprovalsPage() {
  await requireAdminPage();

  const [
    pendingOrganizers,
    pendingClubs,
    pendingGameRequests,
    flaggedTournaments,
    suggestedRules,
    orgApplications,
    nameClaims,
    activeBans,
    planRequests,
  ] = await Promise.all([
    listPendingOrganizers(),
    listPendingClubs(),
    listPendingGameRequests(),
    listFlaggedTournaments(),
    listAllSuggestedRules(),
    listPendingApplications(),
    listPendingClaims(),
    listActiveBans(),
    listPendingPlanRequests(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Approvals</h1>
        <p className="font-sans text-[13px] text-bk-body">Everything waiting for an admin decision.</p>
      </div>

      <OrgApplications
        initial={orgApplications.map((a) => ({
          id: a.id,
          email: a.user.email,
          orgName: a.orgName,
          orgType: a.orgType,
          description: a.description,
          registrationNumber: a.registrationNumber,
          website: a.website,
          country: a.country,
          city: a.city,
          address: a.address,
          contactEmail: a.contactEmail,
          contactPhone: a.contactPhone,
          handlerName: a.handlerName,
          handlerRole: a.handlerRole,
          handlerPhone: a.handlerPhone,
          plan: a.plan,
          attemptCount: a.attemptCount,
          submittedAt: a.submittedAt.toISOString(),
        }))}
      />
      <PlanRequestsQueue initial={planRequests} />
      <NameClaims
        initialClaims={nameClaims.map((c) => ({
          id: c.id,
          clubName: c.clubName,
          explanation: c.explanation,
          evidenceUrl: c.evidenceUrl,
          createdAt: c.createdAt.toISOString(),
          claimant: c.claimant,
          club: c.club
            ? {
                clubName: c.club.clubName,
                status: c.club.status,
                createdAt: c.club.createdAt.toISOString(),
                owner: c.club.user,
              }
            : null,
        }))}
        initialBans={activeBans.map((b) => ({
          id: b.id,
          reason: b.reason,
          endsAt: b.endsAt ? b.endsAt.toISOString() : null,
          user: b.user,
        }))}
      />
      <AdminQueues
        initialOrganizers={pendingOrganizers}
        initialClubs={pendingClubs}
        initialGameRequests={pendingGameRequests}
        initialFlags={flaggedTournaments}
      />
      <SuggestedRulesManager initialRules={suggestedRules} />
    </div>
  );
}
