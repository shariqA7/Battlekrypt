import { getPublicPlayerProfile } from "@/lib/services/tournaments";
import { notFound } from "next/navigation";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import InitialTile from "@/components/ui/InitialTile";
import Stat from "@/components/ui/Stat";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPublicPlayerProfile(id);
  if (!player) notFound();

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <InitialTile name={player.user.displayName} size={64} round src={player.user.avatarUrl} />
        <div className="min-w-0">
          <p className="font-sans font-bold text-[11px] uppercase tracking-[1.6px] text-bk-muted mb-1">Player</p>
          <h1 className="font-sans font-extrabold text-2xl sm:text-3xl text-bk-heading flex items-center gap-2 flex-wrap">
            <span className="break-words min-w-0">{player.user.displayName}</span>
            {player.verified && <VerifiedBadge size={20} />}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat gold value={player._count.registrations} label="Tournaments joined" />
      </div>
    </main>
  );
}
