import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getInstitutionForOrganizer, listCoHostInvitations } from "@/lib/services/institutions";
import { listChallengeCoHostInvitations } from "@/lib/services/challenge-institutions";
import InstituteSetup from "./InstituteSetup";
import InviteButtons from "./InviteButtons";

export default async function OrganizerInstitutePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/organizer/dashboard/institute");

  const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!organizer) redirect("/organizer/onboard");

  const [institute, invites, challengeInvites] = await Promise.all([
    getInstitutionForOrganizer(organizer.id),
    listCoHostInvitations(organizer.id),
    listChallengeCoHostInvitations(organizer.id),
  ]);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">My institute</h1>
      <p className="font-sans text-bk-body text-sm mb-6">
        Register the school, college or university you run. Once an admin verifies it, you can host
        institution-only tournaments and approve your own players.
      </p>

      {institute ? (
        <div className="border border-bk-border p-4 font-sans text-[13px]">
          <p className="text-bk-heading font-bold">{institute.name}</p>
          <p className={institute.verified ? "text-bk-gold-light" : "text-bk-muted"}>
            {institute.verified ? "Verified" : "Waiting for admin verification"}
          </p>
        </div>
      ) : (
        <InstituteSetup />
      )}

      <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">Co-host invitations</p>
      {invites.length === 0 && (
        <p className="font-sans text-[12px] text-bk-muted">No invitations yet.</p>
      )}
      <ul className="space-y-3">
        {invites.map((i) => (
          <li key={i.id} className="border border-bk-border p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words">{i.tournament.name}</p>
            <p className="text-bk-muted text-[12px]">Hosted by {i.tournament.organizer.orgName}</p>
            {i.status === "pending" ? (
              <InviteButtons id={i.id} />
            ) : (
              <a
                href={`/organizer/dashboard/institute/tournaments/${i.tournament.id}`}
                className="inline-block mt-2 text-bk-gold-light text-[12px] underline"
              >
                Review your players&apos; requests
              </a>
            )}
          </li>
        ))}
      </ul>

      <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">Challenge co-host invitations</p>
      {challengeInvites.length === 0 && (
        <p className="font-sans text-[12px] text-bk-muted">No invitations yet.</p>
      )}
      <ul className="space-y-3">
        {challengeInvites.map((i) => (
          <li key={i.id} className="border border-bk-border p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words">{i.challenge.title}</p>
            <p className="text-bk-muted text-[12px]">Hosted by {i.challenge.posterName}</p>
            {i.status === "pending" ? (
              <InviteButtons id={i.id} kind="challenge" />
            ) : (
              <a
                href={`/organizer/dashboard/institute/challenges/${i.challenge.id}`}
                className="inline-block mt-2 text-bk-gold-light text-[12px] underline"
              >
                Review your players&apos; applications
              </a>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
