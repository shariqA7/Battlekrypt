// A team that got a seat off the waiting list (or whose payment was never sent) sends its payment
// here. Until it does, the seat is held only until `payDueAt`; after that it goes to the next team.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";
import { queueProofCheck } from "@/lib/services/proof-fingerprints";
import { parseReference, REFERENCE_REQUIRED_MESSAGE } from "@/lib/proof-match";
import { normalizeProofInput } from "@/lib/proof-storage";
import { refreshSeats } from "@/lib/services/rooms";

export type SeatPaymentError =
  | "not_found" | "forbidden" | "not_waiting_for_payment" | "payment_window_over" | "invalid_payment_proof" | "payment_proof_required" | "payment_reference_required";

export const SEAT_PAYMENT_MESSAGES: Record<SeatPaymentError, [number, string]> = {
  not_found: [404, "Entry not found."],
  forbidden: [403, "Only the person who entered can send this payment."],
  not_waiting_for_payment: [409, "This entry isn't waiting for a payment."],
  payment_window_over: [410, "The time to pay ran out and the seat went to the next team. You can join the waiting list again."],
  invalid_payment_proof: [400, "That payment screenshot isn't valid. Upload it again."],
  payment_proof_required: [400, "Upload your payment screenshot."],
  payment_reference_required: [400, REFERENCE_REQUIRED_MESSAGE],
};

export async function submitSeatPayment(
  registrationId: string,
  userId: string,
  input: { paymentProofUrl?: string; paymentReference?: string },
): Promise<{ error: SeatPaymentError } | { ok: true }> {
  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: {
      id: true, status: true, payerUserId: true, payDueAt: true, paymentProofUrl: true, playerId: true,
      player: { select: { userId: true } },
      tournament: { select: { id: true, name: true, slug: true, entryType: true, organizer: { select: { userId: true } }, organizerId: true } },
    },
  });
  if (!reg) return { error: "not_found" };
  if (reg.payerUserId !== userId && reg.player?.userId !== userId) return { error: "forbidden" };
  if (reg.status !== "pending" || reg.tournament.entryType !== "paid" || reg.paymentProofUrl || !reg.payDueAt) {
    return { error: "not_waiting_for_payment" };
  }
  if (reg.payDueAt.getTime() <= Date.now()) {
    await refreshSeats(reg.tournament.id); // give the seat on now rather than waiting for the next page view
    return { error: "payment_window_over" };
  }
  if (!input.paymentProofUrl) return { error: "payment_proof_required" };
  if (!normalizeProofInput(input.paymentProofUrl, userId)) return { error: "invalid_payment_proof" };
  const reference = parseReference(input.paymentReference);
  if (!reference) return { error: "payment_reference_required" };

  await prisma.registration.update({
    where: { id: reg.id },
    data: { paymentProofUrl: input.paymentProofUrl, paymentReference: reference.display, payDueAt: null },
  });
  await queueProofCheck({ kind: "registration", refId: reg.id, playerId: reg.playerId ?? "", organizerId: reg.tournament.organizerId }, input.paymentProofUrl, reference.key);
  await notify(reg.tournament.organizer.userId, {
    type: "payment_submitted",
    title: `Payment received for ${reg.tournament.name}`,
    body: "A team that was promoted from the waiting list sent its payment. Check it and approve the entry.",
    href: `/organizer/dashboard`,
  });
  return { ok: true };
}
