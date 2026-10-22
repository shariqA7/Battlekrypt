import { createClient } from "@/lib/supabase/server";
import { getPlayerProfileByUserId } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import ProfileForm from "./ProfileForm";
import PayoutForm from "@/components/consent/PayoutForm";
import { getPayoutSummary } from "@/lib/services/payout-methods";
import { Panel, SectionHeading } from "@/components/ui/Panel";
import InstituteSelect from "./InstituteSelect";
import StudentIdCard from "./StudentIdCard";
import { getStudentId, getOwnStudentIdPath } from "@/lib/services/student-id";
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
  const studentId = institution?.institutionId ? await getStudentId(user.id) : null;
  const photoPath = studentId ? await getOwnStudentIdPath(user.id) : null;
  const payout = profile ? await getPayoutSummary(profile.id) : null;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-xl mx-auto w-full">
      <SectionHeading className="mb-6">Profile settings</SectionHeading>
      <Panel className="p-5 sm:p-6 mb-6">
      <ProfileForm
        email={profile?.user.email ?? ""}
        initialAvatarUrl={profile?.user.avatarUrl ?? ""}
        initialFirstName={profile?.firstName ?? ""}
        initialLastName={profile?.lastName ?? ""}
          initialUsername={profile?.username ?? ""}
        initialMobileNumber={profile?.mobileNumber ?? ""}
        initialRegion={profile?.region ?? ""}
        initialCountry={profile?.country ?? ""}
        initialCity={profile?.city ?? ""}
        initialBirthDate={profile?.birthDate ? profile.birthDate.toISOString().slice(0, 10) : ""}
        initialGender={profile?.gender ?? ""}
        initialHobbies={profile?.hobbies ?? ""}
        initialFavoriteGames={profile?.favoriteGames ?? []}
      />
      </Panel>
      {profile && payout && (
        <Panel className="p-5 sm:p-6 mb-6">
          <p className="font-sans font-bold text-bk-heading mb-1">Where should prizes be paid?</p>
          {payout.minor ? (
            <p className="font-sans text-bk-body text-[13px]">
              Because you&apos;re under 18, your parent or guardian sets this and prizes are paid to them. They do it from the link in their approval email.{" "}
              {payout.usable ? "They have added it." : "They haven't added it yet."}
            </p>
          ) : (
            <>
              <p className="font-sans text-bk-body text-[13px] mb-4">
                Saved once and used when you win a prize. Organizers only see it after you win, and the account number is stored encrypted.
              </p>
              {payout.needsReentry && (
                <p className="font-sans text-[12px] text-bk-amber mb-3">You&apos;re 18 now, so please add your own details. Your parent or guardian&apos;s account is no longer used.</p>
              )}
              <PayoutForm
                endpoint="/api/players/me/payout-method"
                saved={payout.method ? { method: payout.method.method, payeeName: payout.method.payeeName } : null}
                defaultName={`${profile.firstName ?? ""} ${profile.lastName ?? ""}`.trim()}
              />
            </>
          )}
        </Panel>
      )}
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
      {profile && studentId && (
        <StudentIdCard
          userId={user.id}
          next={safeNext}
          initial={{
            status: studentId.status,
            expiresAt: studentId.expiresAt ? studentId.expiresAt.toISOString().slice(0, 10) : null,
            daysLeft: studentId.daysLeft,
            studentId: studentId.studentId,
            photoPath,
          }}
        />
      )}
    </main>
  );
}
