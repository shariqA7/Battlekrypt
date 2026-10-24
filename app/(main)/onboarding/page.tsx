import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getOnboardingData, needsOnboarding } from "@/lib/services/onboarding";
import { getPlayerProfileByUserId } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import { safeRedirect } from "@/lib/safe-redirect";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo: rawRedirect } = await searchParams;
  const redirectTo = safeRedirect(rawRedirect);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent("/onboarding")}`);

  // Already through it (or an organizer account): nothing to do here.
  if (!(await needsOnboarding(user.id))) redirect(redirectTo);

  const [data, profile] = await Promise.all([getOnboardingData(user.id), getPlayerProfileByUserId(user.id)]);
  if (!data) redirect(redirectTo);

  return (
    <main className="flex-1 flex flex-col items-center justify-start md:justify-center px-5 py-10">
      <div className="w-full max-w-[460px]">
        <div className="rounded-2xl border border-bk-border bg-bk-bg p-6 sm:p-7" style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}>
          <Suspense fallback={null}>
            <OnboardingFlow
              missing={data.missing}
              needsAbout={data.needsAbout}
              initialFirstName={profile?.firstName ?? ""}
              initialLastName={profile?.lastName ?? ""}
              isMinor={data.isMinor}
              guardianEmailOnFile={!!data.guardianEmail}
              games={data.games}
              initialGames={data.favoriteGames}
              initialPlayStyle={data.playStyle ?? ""}
              initialGender={data.gender}
              initialHobbies={data.hobbies}
              redirectTo={redirectTo}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
