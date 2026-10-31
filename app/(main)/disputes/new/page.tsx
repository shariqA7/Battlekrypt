import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { disputeFormContext } from "@/lib/services/payment-disputes";
import DisputeForm from "./DisputeForm";

export default async function NewDisputePage({ searchParams }: { searchParams: Promise<{ registrationId?: string }> }) {
  const { registrationId } = await searchParams;
  if (!registrationId) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/disputes/new?registrationId=${registrationId}`)}`);

  const ctx = await disputeFormContext(user.id, registrationId);
  if (!ctx) notFound();
  if (ctx.openDisputeId) redirect(`/disputes/${ctx.openDisputeId}`);

  return (
    <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">Payment problem</h1>
      <p className="font-sans text-bk-body text-[13px] mb-1">{ctx.tournamentName}</p>
      <p className="font-sans text-bk-muted text-[12px] mb-6">
        BattleKrypt doesn&apos;t hold entry fees, so the organizer pays any refund directly. The other side gets 48 hours to
        answer, then an admin decides. If an admin rules for the player, the organizer must refund within 5 days or their
        paid events are paused.
      </p>
      <DisputeForm registrationId={ctx.registrationId} kinds={ctx.kinds} />
    </main>
  );
}
