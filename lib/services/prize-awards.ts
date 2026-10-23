import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { AwardInput } from "@/lib/prize-awards";

// Replace a tournament's awards in one transaction (empty list clears them).
export function replacePrizeAwards(tournamentId: string, awards: AwardInput[]): Prisma.PrismaPromise<unknown>[] {
  return [
    prisma.prizeAward.deleteMany({ where: { tournamentId } }),
    ...(awards.length
      ? [
          prisma.prizeAward.createMany({
            data: awards.map((a, i) => ({ tournamentId, name: a.name, cashAmount: a.cashAmount, prizeText: a.prizeText, sortOrder: i })),
          }),
        ]
      : []),
  ];
}

export async function loadAwards(tournamentId: string): Promise<AwardInput[]> {
  const rows = await prisma.prizeAward.findMany({ where: { tournamentId }, orderBy: { sortOrder: "asc" } });
  return rows.map((a) => ({ name: a.name, cashAmount: a.cashAmount == null ? null : Number(a.cashAmount.toString()), prizeText: a.prizeText }));
}
