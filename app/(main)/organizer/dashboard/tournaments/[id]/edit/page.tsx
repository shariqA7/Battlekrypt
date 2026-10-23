import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getTournamentById } from "@/lib/services/tournaments";
import { redirect, notFound } from "next/navigation";
import EditForm from "./EditForm";
import { Panel, SectionHeading } from "@/components/ui/Panel";

export default async function EditTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/organizer/dashboard/tournaments/${id}/edit`);

  const organizerProfile = await prisma.organizerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!organizerProfile) redirect("/organizer/onboard");

  const tournament = await getTournamentById(id);
  if (!tournament) notFound();
  if (tournament.organizerId !== organizerProfile.id) redirect("/organizer/dashboard");

  // Editing is only offered for drafts in the UI — the API itself doesn't
  // restrict by status, but changing capacity/pricing after people have
  // registered is the kind of thing that should go through Cancel + new
  // tournament instead, not a silent edit.
  if (tournament.status !== "draft") {
    redirect(`/organizer/dashboard/tournaments/${id}`);
  }

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-2xl mx-auto w-full">
      <SectionHeading className="mb-6">Edit tournament</SectionHeading>
      <Panel className="p-5 sm:p-6">
      <EditForm
        tournament={{
          ...tournament,
          prizeTiers: tournament.prizeTiers.map((t) => ({ positionFrom: t.positionFrom, positionTo: t.positionTo, amount: Number(t.amount) })),
          prizeAwards: tournament.prizeAwards.map((a) => ({ name: a.name, cashAmount: a.cashAmount == null ? null : Number(a.cashAmount), prizeText: a.prizeText })),
        }}
      />
      </Panel>
    </main>
  );
}
