// Who may open a payment proof. Proofs are private files: nobody gets one by its path. They ask
// /api/proofs/<kind>/<id>, this decides, and only then does the server hand out a 5-minute link.
//
//   registration   the payer; the organizer team of the event (owner and members); a co-host
//                  institute that the entry was routed to; admins with Approvals
//   plan_request   the person who paid; admins with Payments
//   club_fee       the club owner; admins with Approvals (the Clubs queue)
//   invoice        the account that owes it and its organization's team; admins with Payments
//   dispute        the two sides of the case; admins with Approvals (the evidence they uploaded)
//   challenge_proof / challenge_receipt / challenge_dispute
//                  the poster and the challenger of that entry; admins with Approvals
//   expense        admins with Ledger (the receipt on a ledger expense)
import { prisma } from "@/lib/prisma";
import { loadStaffContext } from "@/lib/services/staff";
import { hasAccess, type AdminArea } from "@/lib/staff-permissions";
import { PROOF_BUCKET, PROOF_LINK_SECONDS, isPrivateProofPath } from "@/lib/proof-storage";
import { createServiceClient } from "@/lib/supabase/admin";

export type ProofKindParam =
  | "registration" | "plan_request" | "club_fee" | "invoice" | "dispute"
  | "challenge_proof" | "challenge_receipt" | "challenge_dispute" | "expense";
export const PROOF_KINDS: ProofKindParam[] = [
  "registration", "plan_request", "club_fee", "invoice", "dispute",
  "challenge_proof", "challenge_receipt", "challenge_dispute", "expense",
];

export type ProofAccessResult = { value: string } | { error: "not_found" | "forbidden" };

async function isStaffFor(userId: string, area: AdminArea) {
  const staff = await loadStaffContext(userId);
  return hasAccess(staff, area, "view");
}

/** The owner of an organization, or someone the owner added to its team. */
async function onOrganizerTeam(userId: string, organizerId: string) {
  const [owner, member] = await Promise.all([
    prisma.organizerProfile.count({ where: { id: organizerId, userId } }),
    prisma.organizationMember.count({ where: { organizerId, userId } }),
  ]);
  return owner + member > 0;
}

export async function authorizeProofView(input: {
  viewerUserId: string;
  kind: ProofKindParam;
  id: string;
  side?: string | null;
  index?: number;
}): Promise<ProofAccessResult> {
  const { viewerUserId: uid, id } = input;
  const no = { error: "forbidden" as const };
  const gone = { error: "not_found" as const };

  switch (input.kind) {
    case "registration": {
      const r = await prisma.registration.findUnique({
        where: { id },
        select: {
          paymentProofUrl: true, payerUserId: true, routedInstitutionId: true, tournamentId: true,
          tournament: { select: { organizerId: true } },
          player: { select: { userId: true } },
          teamEntry: { select: { members: { select: { player: { select: { userId: true } } } } } },
        },
      });
      if (!r?.paymentProofUrl) return gone;
      const payers: string[] = r.payerUserId ? [r.payerUserId] : r.player ? [r.player.userId] : (r.teamEntry?.members ?? []).map((m: { player: { userId: string } }) => m.player.userId);
      if (payers.includes(uid)) return { value: r.paymentProofUrl };
      if (await onOrganizerTeam(uid, r.tournament.organizerId)) return { value: r.paymentProofUrl };
      if (r.routedInstitutionId) {
        const cohost = await prisma.tournamentInstitution.count({
          where: { tournamentId: r.tournamentId, institutionId: r.routedInstitutionId, role: "cohost", status: "accepted" },
        });
        if (cohost > 0) {
          const inst = await prisma.institution.findUnique({ where: { id: r.routedInstitutionId }, select: { organizerId: true } });
          if (inst && (await onOrganizerTeam(uid, inst.organizerId))) return { value: r.paymentProofUrl };
        }
      }
      return (await isStaffFor(uid, "approvals")) ? { value: r.paymentProofUrl } : no;
    }
    case "plan_request": {
      const p = await prisma.planRequest.findUnique({ where: { id }, select: { proofUrl: true, userId: true } });
      if (!p) return gone;
      return p.userId === uid || (await isStaffFor(uid, "payments")) ? { value: p.proofUrl } : no;
    }
    case "club_fee": {
      const c = await prisma.clubProfile.findUnique({ where: { id }, select: { feeProofUrl: true, userId: true } });
      if (!c?.feeProofUrl) return gone;
      return c.userId === uid || (await isStaffFor(uid, "approvals")) ? { value: c.feeProofUrl } : no;
    }
    case "invoice": {
      const i = await prisma.invoice.findUnique({ where: { id }, select: { proofUrl: true, userId: true, organizerId: true } });
      if (!i?.proofUrl) return gone;
      if (i.userId === uid || (await onOrganizerTeam(uid, i.organizerId)) || (await isStaffFor(uid, "payments"))) return { value: i.proofUrl };
      return no;
    }
    case "dispute": {
      const d = await prisma.paymentDispute.findUnique({
        where: { id },
        select: { payerUserId: true, organizerUserId: true, openedByUserId: true, openerEvidenceUrls: true, responderEvidenceUrls: true },
      });
      if (!d) return gone;
      if (uid !== d.payerUserId && uid !== d.organizerUserId && !(await isStaffFor(uid, "approvals"))) return no;
      const list = input.side === "responder" ? d.responderEvidenceUrls : d.openerEvidenceUrls;
      const value = list[input.index ?? 0];
      return value ? { value } : gone;
    }
    case "challenge_proof":
    case "challenge_receipt": {
      const app = await prisma.challengeApplication.findUnique({
        where: { id },
        select: { applicantUserId: true, proofUrls: true, paymentReceiptUrls: true, challenge: { select: { posterUserId: true } } },
      });
      if (!app) return gone;
      if (uid !== app.applicantUserId && uid !== app.challenge.posterUserId && !(await isStaffFor(uid, "approvals"))) return no;
      const value = (input.kind === "challenge_proof" ? app.proofUrls : app.paymentReceiptUrls)[input.index ?? 0];
      return value ? { value } : gone;
    }
    case "challenge_dispute": {
      const d = await prisma.challengeDispute.findUnique({
        where: { id },
        select: { openerEvidenceUrls: true, responderEvidenceUrls: true, application: { select: { applicantUserId: true, challenge: { select: { posterUserId: true } } } } },
      });
      if (!d) return gone;
      if (uid !== d.application.applicantUserId && uid !== d.application.challenge.posterUserId && !(await isStaffFor(uid, "approvals"))) return no;
      const list = input.side === "responder" ? d.responderEvidenceUrls : d.openerEvidenceUrls;
      const value = list[input.index ?? 0];
      return value ? { value } : gone;
    }
    case "expense": {
      if (!(await isStaffFor(uid, "ledger"))) return no;
      const e = await prisma.expense.findUnique({ where: { id }, select: { receiptUrl: true } });
      return e?.receiptUrl ? { value: e.receiptUrl } : gone;
    }
  }
}

/** Where to send the viewer: an old public link as it is, a private file as a 5-minute signed link. */
export async function linkForProof(value: string): Promise<string | null> {
  if (!isPrivateProofPath(value)) return value;
  const { data, error } = await createServiceClient().storage.from(PROOF_BUCKET).createSignedUrl(value, PROOF_LINK_SECONDS);
  return error || !data ? null : data.signedUrl;
}
