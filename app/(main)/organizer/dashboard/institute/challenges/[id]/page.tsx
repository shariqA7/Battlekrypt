import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listApplicationsForInstitute } from "@/lib/services/challenge-institutions";
import ChallengeCoHostQueue from "./ChallengeCoHostQueue";

// A co-host institute sees ONLY the applicants of its own institute.
export default async function ChallengeCoHostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/organizer/dashboard/institute/challenges/${id}`);

  const organizer = await prisma.organizerProfile.findUnique({ where: { userId: user.id } });
  if (!organizer) redirect("/organizer/onboard");

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { title: true, posterName: true, status: true },
  });
  if (!challenge) notFound();

  const result = await listApplicationsForInstitute(id, organizer.id);
  if ("error" in result) redirect("/organizer/dashboard/institute");

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">{challenge.title}</h1>
      <p className="font-sans text-bk-body text-sm mb-6">
        Co-hosting for {challenge.posterName}. Approve or reject applicants from your own institute;
        the poster can only pick applicants an institute has approved.
      </p>
      <ChallengeCoHostQueue
        open={challenge.status === "open"}
        initial={result.data.map((a) => ({
          id: a.id,
          name: a.entrantName,
          kind: a.kind,
          rating: a.rating,
          status: a.status,
          review: a.institutionReview,
        }))}
      />
    </main>
  );
}
