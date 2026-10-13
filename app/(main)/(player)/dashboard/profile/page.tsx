import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import InstituteSelect from "./InstituteSelect";
import { institutionChangeUnlocksAt, countActiveEntries } from "@/lib/services/institutions";
import { getInstitutionForUser } from "@/lib/services/institutions";

export default async function PlayerProfileSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only same-site paths — never an open redirect.
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/dashboard/profile");

  const profile = await getPlayerProfileByUserId(user.id);
  const institution = profile ? await getInstitutionForUser(user.id) : null;
  const activeEntries = profile ? (await countActiveEntries(profile.id, user.id)).total : 0;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-xl mx-auto w-full">
      <SectionHeading className="mb-6">Profile settings</SectionHeading>
      <Panel className="p-5 sm:p-6 mb-6">
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
      </Panel>
      {profile && (
        <InstituteSelect
          next={safeNext}
          activeEntries={activeEntries}
          initial={
            institution
              ? {
                  institutionId: institution.institutionId,
                  institutionName: institution.institution?.name ?? institution.institutionName,
                  studentId: institution.studentId,
                  changeUnlocksAt: institution.institutionId
                    ? institutionChangeUnlocksAt(institution.lastChangedAt).toISOString()
                    : null,
                }
              : null
          }
        />
      )}
    </main>
  );
}
