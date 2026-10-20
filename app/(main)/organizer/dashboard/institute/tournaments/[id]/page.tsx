import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listRegistrations } from "@/lib/services/tournaments";
import CoHostQueue from "./CoHostQueue";
import { SectionHeading } from "@/components/ui/Panel";

// A co-host institute sees ONLY the registrations routed to its own institute.
export default async function CoHostQueuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/organizer/dashboard/institute/tournaments/${id}`);

  const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!organizer) redirect("/organizer/onboard");

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { name: true, entryType: true, noShowPenalty: true, noShowPenaltyPoints: true, organizer: { select: { orgName: true } } },
  });
  if (!tournament) notFound();

  const myInstitutionId =
    (await prisma.institution.findUnique({ where: { organizerId: organizer.id }, select: { id: true } }))?.id ?? null;
  const result = await listRegistrations(id, organizer.id);
  if ("error" in result) redirect("/organizer/dashboard/institute");

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-2xl mx-auto w-full">
      <SectionHeading className="mb-3 break-words">{tournament.name}</SectionHeading>
      <p className="font-sans text-bk-body text-sm mb-6 pl-[19px]">
        Co-hosting for {tournament.organizer.orgName}. You can approve or reject players from your
        own institute, and disqualify or report a no-show for them (cheating is disqualification; the organizer decides the no-show penalty). {tournament.entryType === "paid" && "The host confirms entry-fee payments."}
      </p>
      <CoHostQueue
        key={result.data.map((r) => `${r.id}.${r.status}.${r.penalties.map((p) => p.id).join("+")}`).join("|")}
        noShowPolicy={{ penalty: tournament.noShowPenalty, points: tournament.noShowPenaltyPoints }}
        myInstitutionId={myInstitutionId}
        initial={result.data.map((r) => ({
          id: r.id,
          status: r.status,
          name: r.teamEntry?.name ?? r.player?.user.displayName ?? "Unknown",
          institutionProofPath: r.institutionProofPath,
          awaitingHostPayment: !!r.institutionApprovedAt && r.status === "pending",
          penalties: r.penalties,
        }))}
      />
    </main>
  );
}
