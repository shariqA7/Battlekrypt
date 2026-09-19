import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listRegistrations, getTournamentById } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import RegistrationQueue from "./RegistrationQueue";
import StageManager from "./StageManager";
import PublishButton from "./PublishButton";
import CancelButton from "./CancelButton";

export default async function ManageTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/organizer/dashboard/tournaments/${id}`);

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/onboard");

  const tournament = await getTournamentById(id);
  if (!tournament) notFound();
  if (tournament.organizerId !== organizerProfile.id) redirect("/organizer/dashboard");

  const result = await listRegistrations(id, organizerProfile.id);
  if ("error" in result) {
    // Ownership was already verified above, so this should be unreachable —
    // but redirecting gracefully is safer than crashing if it ever happens.
    redirect("/organizer/dashboard");
  }
  const registrations = result.data;

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-start mb-1">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {tournament.name}
          </h1>
          <PublishButton tournamentId={id} status={tournament.status} />
        </div>
        <p className="font-sans text-bk-body text-sm mb-3">
          Manage registrations and match rooms
        </p>
        <div className="flex items-center gap-4 mb-8">
          {tournament.status === "draft" && (
            <a
              href={`/organizer/dashboard/tournaments/${id}/edit`}
              className="text-bk-gold-light font-sans text-[11px] uppercase tracking-[0.5px] underline"
            >
              Edit tournament
            </a>
          )}
          <CancelButton tournamentId={id} status={tournament.status} />
        </div>

        <StageManager tournamentId={id} initialStages={tournament.stages} />

        <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">
          Registrations ({registrations.length})
        </p>
        <RegistrationQueue tournamentId={id} initialRegistrations={registrations} />
      </main>
    </>
  );
}
