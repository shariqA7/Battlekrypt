import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";

export default async function PlayerProfileSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/profile");

  const profile = await getPlayerProfileByUserId(user.id);

  return (
    <main className="flex-1 px-6 py-10 max-w-md mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">
        Profile settings
      </h1>
      <ProfileForm
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
    </main>
  );
}
