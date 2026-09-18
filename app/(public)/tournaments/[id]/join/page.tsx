import Nav from "@/components/layout/Nav";
import { getTournamentById } from "@/lib/services/tournaments";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import JoinForm from "./JoinForm";

export default async function JoinTournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?redirectTo=/tournaments/${id}/join`);

  const tournament = await getTournamentById(id);
  if (!tournament) notFound();

  return (
    <>
      <Nav />
      <main className="flex-1 px-6 py-10 max-w-lg mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-1">
          Join {tournament.name}
        </h1>
        <p className="font-sans text-bk-body text-sm mb-6">
          {tournament.entryType === "paid"
            ? `Entry fee: ${tournament.entryFeeCurrency} ${tournament.entryFeeAmount}`
            : "Free entry"}
        </p>
        <JoinForm tournamentId={id} tournament={tournament} />
      </main>
    </>
  );
}
