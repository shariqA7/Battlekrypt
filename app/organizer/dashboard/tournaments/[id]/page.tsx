import Nav from "@/components/layout/Nav";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listRegistrations, getTournamentById } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import RegistrationQueue from "./RegistrationQueue";
import StageManager from "./StageManager";
import PublishButton from "./PublishButton";

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
  const registrations = ("data" in result ? result.data : []) ?? [];

  // Map to the shape expected by the client component
  const mappedRegistrations = registrations.map((r) => ({
    id: r.id,
    status: r.status,
    paymentStatus: r.paymentStatus,
    paymentProofUrl: r.paymentProofUrl,
    player: r.player ? { user: { displayName: r.player.user.displayName } } : null,
    teamEntry: r.teamEntry
      ? { name: (r.teamEntry as { name?: string }).name ?? "Unnamed Team", members: r.teamEntry.members }
      : null,
  }));

  return (
    <>
      <Nav />
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <div className="flex justify-between items-start mb-1">
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {tournament.name}
          </h1>
          <PublishButton tournamentId={id} status={tournament.status} />
        </div>
        <p className="font-sans text-bk-body text-sm mb-8">
          Manage registrations and match rooms
        </p>

        <StageManager tournamentId={id} initialStages={tournament.stages} />

        <p className="font-sans font-medium text-bk-heading text-sm mt-10 mb-3">
          Registrations ({mappedRegistrations.length})
        </p>
        <RegistrationQueue initialRegistrations={mappedRegistrations} />
      </main>
    </>
  );
}
