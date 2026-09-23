import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function GamesPage() {
  const games = await prisma.game.findMany({
    where: { isApproved: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">
        Games
      </h1>
      <div className="grid grid-cols-3 gap-3">
        {games.map((g) => (
          <Link
            key={g.id}
            href={`/tournaments?game=${encodeURIComponent(g.name)}`}
            className="bg-bk-surface border border-bk-border p-4 text-center hover:border-bk-gold-light transition-colors"
          >
            <p className="font-sans font-medium text-bk-heading text-sm">{g.name}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
