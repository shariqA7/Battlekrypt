import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canRateTournament } from "@/lib/services/organizer-ratings";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import RatingForm from "./RatingForm";

export default async function RateOrganizerPage({ searchParams }: { searchParams: Promise<{ tournamentId?: string }> }) {
  const { tournamentId } = await searchParams;
  if (!tournamentId) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/ratings/new?tournamentId=${tournamentId}`)}`);

  if (!(await getFeatureFlags()).organizerRatings) {
    return <FeatureOffNotice title="Ratings are switched off">Rating organizers isn&apos;t available right now.</FeatureOffNotice>;
  }
  const info = await canRateTournament(user.id, tournamentId);
  if (!info) notFound();

  return (
    <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Rate the organizer</h1>
      <p className="font-sans text-bk-body text-[13px] mb-1">
        {info.organizerName} · {info.tournamentName}
      </p>
      <p className="font-sans text-bk-muted text-[12px] mb-6">
        Your rating helps other players choose events. Rate how the event was run: communication, fairness, and whether prizes and refunds were handled. You can change it later.
      </p>
      <RatingForm tournamentId={tournamentId} initialStars={info.existing?.stars ?? 0} initialComment={info.existing?.comment ?? ""} />
    </main>
  );
}
