// A cancelled session's refunds settle themselves. The organizer only marks each refund as sent. Once
// nobody is waiting (no player still choosing, no refund still owed or open) the session counts as
// confirmed, which stops the payout-hold clock. No second "confirm" step to forget.
import { prisma } from "@/lib/prisma";

const OUTSTANDING = ["owed", "requested", "waiting_resale"] as const;

export async function settleRefundsIfDone(tournamentId: string): Promise<boolean> {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { seriesId: true, status: true, cancelRefundsDueAt: true, refundsConfirmedAt: true } });
  if (!t || !t.seriesId || t.status !== "cancelled" || !t.cancelRefundsDueAt || t.refundsConfirmedAt) return false;
  const open = await prisma.registration.count({
    where: { tournamentId, OR: [{ choiceStatus: "pending" }, { refundStatus: { in: [...OUTSTANDING] } }] },
  });
  if (open > 0) return false;
  const done = await prisma.tournament.updateMany({ where: { id: tournamentId, refundsConfirmedAt: null }, data: { refundsConfirmedAt: new Date() } });
  return done.count > 0;
}
