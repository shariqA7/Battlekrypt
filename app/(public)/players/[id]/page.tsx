import { getPublicPlayerProfile } from "@/lib/services/tournaments";
import { notFound } from "next/navigation";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPublicPlayerProfile(id);
  if (!player) notFound();

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-bk-surface flex items-center justify-center text-bk-heading font-sans font-bold text-lg overflow-hidden">
          {player.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={player.user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            player.user.displayName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <h1 className="font-sans font-extrabold text-2xl text-bk-heading">
            {player.user.displayName}
          </h1>
        </div>
      </div>

      <div className="bg-bk-surface p-4 inline-block">
        <p className="font-mono text-2xl text-bk-gold-light">
          {player._count.registrations}
        </p>
        <p className="font-sans text-bk-muted text-xs uppercase tracking-[0.5px]">
          Tournaments joined
        </p>
      </div>
    </main>
  );
}
