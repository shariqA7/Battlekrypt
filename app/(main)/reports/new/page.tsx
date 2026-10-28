import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canReportTournament } from "@/lib/services/organizer-reports";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import ReportForm from "./ReportForm";

export default async function NewReportPage({ searchParams }: { searchParams: Promise<{ tournamentId?: string }> }) {
  const { tournamentId } = await searchParams;
  if (!tournamentId) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/reports/new?tournamentId=${tournamentId}`)}`);

  if (!(await getFeatureFlags()).playerReports) {
    return <FeatureOffNotice title="Reports are switched off">Reporting isn&apos;t available right now.</FeatureOffNotice>;
  }
  const info = await canReportTournament(user.id, tournamentId);
  if (!info) notFound();

  return (
    <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Report a problem</h1>
      <p className="font-sans text-bk-body text-[13px] mb-1">
        {info.tournamentName} · {info.organizerName}
      </p>
      <p className="font-sans text-bk-muted text-[12px] mb-6">
        BattleKrypt doesn&apos;t hold entry fees or prizes, so it can&apos;t refund you. An admin reviews reports, and several
        reports about one organizer pause its new paid events until it is reviewed.
      </p>
      <ReportForm tournamentId={tournamentId} />
    </main>
  );
}
