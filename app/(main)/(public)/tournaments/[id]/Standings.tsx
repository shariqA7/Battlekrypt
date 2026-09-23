interface StandingRow {
  id: string;
  placement: number | null;
  points: number | null;
  player: { user: { displayName: string } } | null;
  teamEntry: { name: string } | null;
}

export default function Standings({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="font-sans font-medium text-bk-heading text-sm mb-2">Standings</p>
      <div className="flex flex-col gap-1.5">
        {standings.map((s, i) => {
          const name = s.teamEntry?.name ?? s.player?.user.displayName ?? "Unknown";
          return (
            <div
              key={s.id}
              className="bg-bk-surface p-2.5 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-bk-gold-light text-sm w-6">
                  {s.placement ?? i + 1}
                </span>
                <span className="font-sans text-bk-heading text-sm">{name}</span>
              </div>
              {s.points != null && (
                <span className="font-mono text-bk-body text-xs">{s.points} pts</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
