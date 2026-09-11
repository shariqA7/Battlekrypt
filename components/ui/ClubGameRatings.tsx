// ClubGameRatings.tsx
// Replaces the "CLUB RATING (AVG)" single blended figure found in the
// Figma file (node 3:517) — rating must stay per-game, never averaged,
// since skill in one game says nothing about another (see spec §9).

interface GameRating {
  gameId: string;
  gameName: string;
  rating: number;
}

interface ClubGameRatingsProps {
  ratings: GameRating[];
  onAddGame?: () => void;
}

export default function ClubGameRatings({
  ratings,
  onAddGame,
}: ClubGameRatingsProps) {
  return (
    <div className="flex gap-3 overflow-x-auto">
      {ratings.map((r, i) => (
        <div
          key={r.gameId}
          className="bg-[#1F2833] border border-[#39342A] px-4.5 py-3.5 text-center flex-shrink-0 min-w-[130px]"
        >
          <p className="font-sans text-[10px] tracking-[1px] text-[#D1C5AE] uppercase mb-1.5">
            {r.gameName} rating
          </p>
          <p
            className={`font-mono text-[20px] font-medium ${
              i === 0 ? "text-[#FFE7AD]" : "text-[#EAE1D3]"
            }`}
          >
            {r.rating.toLocaleString()}
          </p>
        </div>
      ))}

      {onAddGame && (
        <button
          onClick={onAddGame}
          className="bg-[#1F2833] border border-dashed border-[#39342A] px-4.5 py-3.5 text-center flex-shrink-0 min-w-[130px] opacity-60 hover:opacity-100"
        >
          <p className="font-sans text-[10px] tracking-[1px] text-[#D1C5AE] uppercase">
            + Add game
          </p>
        </button>
      )}
    </div>
  );
}

// If a club plays many games, consider capping the inline strip to the
// top 3-4 by rating and linking "View all" to a dedicated ratings tab —
// decide this once real club data shows how many games clubs typically play.
