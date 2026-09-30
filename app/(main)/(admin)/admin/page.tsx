import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  listPendingOrganizers,
  listPendingGameRequests,
  listFlaggedTournaments,
  getSiteSettings,
  listCarouselSlides,
} from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import { listPendingClubs, getClubPaymentInstructions } from "@/lib/services/clubs";
import { listAllSuggestedRules } from "@/lib/services/rules";
import AdminQueues from "./AdminQueues";
import SuggestedRulesManager from "./SuggestedRulesManager";
import ClubFeeSettings from "./ClubFeeSettings";
import BrandingManager from "./BrandingManager";
import PlanManager from "./PlanManager";
import PlanSettings from "./PlanSettings";
import PlanRequestsQueue from "./PlanRequestsQueue";
import { getPlanSettings, listPendingPlanRequests, listPlans } from "@/lib/services/plan-requests";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin");

  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  if (!userRecord?.isAdmin) redirect("/");

  const [
    pendingOrganizers,
    pendingClubs,
    pendingGameRequests,
    flaggedTournaments,
    siteSettings,
    slides,
    clubPaymentInstructions,
  ] = await Promise.all([
    listPendingOrganizers(),
    listPendingClubs(),
    listPendingGameRequests(),
    listFlaggedTournaments(),
    getSiteSettings(),
    listCarouselSlides(),
    getClubPaymentInstructions(),
  ]);
  const suggestedRules = await listAllSuggestedRules();
  const [plans, planSettings, planRequests] = await Promise.all([
    listPlans(),
    getPlanSettings(),
    listPendingPlanRequests(),
  ]);

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">
          Admin
        </h1>
        <BrandingManager
          initialLogoUrl={siteSettings.logoUrl ?? ""}
          initialSlides={slides}
        />
        <div className="h-px bg-bk-border my-10" />
        <ClubFeeSettings initialInstructions={clubPaymentInstructions ?? ""} />
        <div className="h-px bg-bk-border my-10" />
        <SuggestedRulesManager initialRules={suggestedRules} />
        <div className="h-px bg-bk-border my-10" />
        <PlanRequestsQueue initial={planRequests} />
        <div className="h-px bg-bk-border my-10" />
        <PlanManager initialPlans={plans} />
        <div className="h-px bg-bk-border my-10" />
        <PlanSettings
          initialInstructions={planSettings.planPaymentInstructions ?? ""}
          initialAdsEnabled={planSettings.adsEnabled}
        />
        <div className="h-px bg-bk-border my-10" />
        <AdminQueues
          initialOrganizers={pendingOrganizers}
          initialClubs={pendingClubs}
          initialGameRequests={pendingGameRequests}
          initialFlags={flaggedTournaments}
        />
      </main>
    </>
  );
}
