import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import AuthStageRail from "@/components/auth/AuthStageRail";
import OnboardingClient from "./OnboardingClient";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/onboarding");

  const profile = await getPlayerProfileByUserId(user.id);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <AuthStageRail step={2} />
      <div className="w-[420px]">
        <p className="font-sans font-extrabold text-[32px] leading-[1.15] text-bk-heading mb-2">
          Complete your profile
        </p>
        <p className="font-sans text-[14px] text-bk-body mb-7">
          A few real details help organizers verify you and get you into rooms faster. You
          can edit these anytime from Profile settings.
        </p>
        <div
          className="rounded-2xl border border-bk-border p-7"
          style={{ boxShadow: "0 0 60px rgba(244,200,66,0.07)" }}
        >
          <Suspense fallback={null}>
            <OnboardingClient
              email={profile?.user.email ?? ""}
              initialAvatarUrl={profile?.user.avatarUrl ?? ""}
              initialFirstName={profile?.firstName ?? ""}
              initialLastName={profile?.lastName ?? ""}
              initialMobileNumber={profile?.mobileNumber ?? ""}
              initialRegion={profile?.region ?? ""}
              initialCountry={profile?.country ?? ""}
              initialCity={profile?.city ?? ""}
              initialAge={profile?.age ?? undefined}
              initialGender={profile?.gender ?? ""}
              initialHobbies={profile?.hobbies ?? ""}
              initialFavoriteGames={profile?.favoriteGames ?? []}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
