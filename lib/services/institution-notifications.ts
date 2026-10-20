// Who gets told what in institution-only tournaments and challenges. All
// best-effort: a failed lookup or insert is logged and swallowed, never allowed
// to undo the action that triggered it.
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/services/notifications";

type Kind = "tournament" | "challenge";

async function safely(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    console.error(`${label} notification failed`, e);
  }
}

// The institute is run by an organization: its notifications go to that account.
async function instituteOwner(institutionId: string) {
  return prisma.institution.findUnique({
    where: { id: institutionId },
    select: { name: true, organizer: { select: { userId: true } } },
  });
}

async function event(kind: Kind, id: string) {
  if (kind === "tournament") {
    const t = await prisma.tournament.findUnique({
      where: { id },
      select: { name: true, organizer: { select: { userId: true, orgName: true } } },
    });
    return t
      ? {
          name: t.name,
          hostUserId: t.organizer.userId,
          hostName: t.organizer.orgName,
          hostHref: `/organizer/dashboard/tournaments/${id}`,
          queueHref: `/organizer/dashboard/institute/tournaments/${id}`,
        }
      : null;
  }
  const c = await prisma.challenge.findUnique({
    where: { id },
    select: { title: true, posterUserId: true, posterName: true },
  });
  return c
    ? {
        name: c.title,
        hostUserId: c.posterUserId,
        hostName: c.posterName,
        hostHref: `/challenges/${id}`,
        queueHref: `/organizer/dashboard/institute/challenges/${id}`,
      }
    : null;
}


// The host added an institute: tell that institute's organization.
export function notifyInviteSent(kind: Kind, eventId: string, institutionId: string, role: "cohost" | "guest") {
  return safely("invite", async () => {
    const [ev, inst] = await Promise.all([event(kind, eventId), instituteOwner(institutionId)]);
    if (!ev || !inst) return;
    await notify(inst.organizer.userId, {
      type: "institute_invite",
      title:
        role === "cohost"
          ? `${ev.hostName} invited your institute to co-host "${ev.name}"`
          : `${ev.hostName} added your institute as a guest in "${ev.name}"`,
      body:
        role === "cohost"
          ? `Accept to approve your own players' ${kind === "tournament" ? "entries" : "applications"}.`
          : `Your players can take part; ${ev.hostName} approves them.`,
      href: "/organizer/dashboard/institute",
    });
  });
}

// The invited institute answered: tell the host.
export function notifyInviteAnswered(kind: Kind, eventId: string, institutionId: string, accepted: boolean) {
  return safely("invite response", async () => {
    const [ev, inst] = await Promise.all([event(kind, eventId), instituteOwner(institutionId)]);
    if (!ev || !inst) return;
    await notify(ev.hostUserId, {
      type: "institute_invite_response",
      title: `${inst.name} ${accepted ? "accepted" : "declined"} your co-host invite for "${ev.name}"`,
      href: ev.hostHref,
    });
  });
}

// A new entry/application landed in a co-host's queue: tell that co-host.
export function notifyNewQueueItem(kind: Kind, eventId: string, routedInstitutionId: string) {
  return safely("queue", async () => {
    const [ev, inst] = await Promise.all([event(kind, eventId), instituteOwner(routedInstitutionId)]);
    if (!ev || !inst) return;
    await notify(inst.organizer.userId, {
      type: "institute_queue",
      title: `New ${kind === "tournament" ? "entry" : "applicant"} from your institute`,
      body: `For "${ev.name}". Review it in your co-host queue.`,
      href: ev.queueHref,
    });
  });
}

// A co-host approved a PAID entry: only eligibility is confirmed, the host must
// still check the payment.
export function notifyAwaitingPayment(tournamentId: string, institutionId: string) {
  return safely("awaiting payment", async () => {
    const [ev, inst] = await Promise.all([event("tournament", tournamentId), instituteOwner(institutionId)]);
    if (!ev || !inst) return;
    await notify(ev.hostUserId, {
      type: "institute_awaiting_payment",
      title: `${inst.name} approved an entry for "${ev.name}"`,
      body: "It's a paid entry: check the payment to finish approving it.",
      href: ev.hostHref,
    });
  });
}

// Tell the player how their entry went. Team/club entries have no single
// account behind them, so they are skipped.
export function notifyEntryDecision(registrationId: string, approved: boolean, byCoHost: boolean, awaitingPayment: boolean) {
  return safely("entry decision", async () => {
    const r = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { player: { select: { userId: true } }, tournament: { select: { id: true, name: true } } },
    });
    if (!r?.player) return;
    const who = byCoHost ? "your institute" : "the organizer";
    await notify(r.player.userId, {
      type: approved ? "entry_approved" : "entry_rejected",
      title: approved
        ? awaitingPayment
          ? `Your institute approved your entry for "${r.tournament.name}"`
          : `Your entry for "${r.tournament.name}" was approved`
        : `Your entry for "${r.tournament.name}" was not approved`,
      body: approved
        ? awaitingPayment
          ? "The organizer still has to confirm your payment."
          : undefined
        : `Reviewed by ${who}.`,
      href: `/tournaments/${r.tournament.id}`,
    });
  });
}

// The institute vouched for a challenge applicant.
export function notifyApplicantApproved(applicantUserId: string, challengeId: string, title: string) {
  return safely("applicant approved", async () => {
    await notify(applicantUserId, {
      type: "challenge_institute_approved",
      title: "Your institute approved your application",
      body: `For "${title}". The poster can now pick you.`,
      href: `/challenges/${challengeId}`,
    });
  });
}


// ---------------------------------------------------------------
// Penalties (cheating / no-shows)
// ---------------------------------------------------------------

const penaltyTitle = (kind: string, points: number | null, name: string) =>
  kind === "disqualification"
    ? `You were disqualified from "${name}"`
    : kind === "point_deduction"
      ? `${points} point${points === 1 ? "" : "s"} deducted in "${name}"`
      : `You received a warning in "${name}"`;

// Tell the entrant, and the other side of the host/co-host pair, what happened.
export function notifyPenaltyIssued(penaltyId: string) {
  return safely("penalty", async () => {
    const p = await prisma.penalty.findUnique({
      where: { id: penaltyId },
      select: {
        kind: true,
        points: true,
        reason: true,
        issuedByUserId: true,
        issuedByInstitutionId: true,
        registration: {
          select: {
            routedInstitutionId: true,
            player: { select: { userId: true } },
            tournament: { select: { id: true, name: true, organizer: { select: { userId: true } } } },
          },
        },
      },
    });
    if (!p) return;
    const t = p.registration.tournament;
    const hostUserId = t.organizer.userId;

    // The entrant. (Team/club entries have no single account behind them.)
    if (p.registration.player) {
      await notify(p.registration.player.userId, {
        type: "penalty_issued",
        title: penaltyTitle(p.kind, p.points, t.name),
        body: p.reason,
        href: `/tournaments/${t.id}`,
      });
    }
    const what = p.kind === "disqualification" ? "disqualified" : p.kind === "point_deduction" ? "penalised" : "warned";
    // A co-host acted: the host should know.
    if (p.issuedByUserId !== hostUserId) {
      const inst = p.issuedByInstitutionId ? await instituteOwner(p.issuedByInstitutionId) : null;
      await notify(hostUserId, {
        type: "penalty_by_cohost",
        title: `${inst?.name ?? "A co-host institute"} ${what} an entry in "${t.name}"`,
        body: p.reason,
        href: `/organizer/dashboard/tournaments/${t.id}`,
      });
    } else if (p.registration.routedInstitutionId) {
      // The host acted on a co-host's player: that institute should know.
      const inst = await instituteOwner(p.registration.routedInstitutionId);
      if (inst) {
        await notify(inst.organizer.userId, {
          type: "penalty_on_your_player",
          title: `The organizer ${what} a player from your institute in "${t.name}"`,
          body: p.reason,
          href: `/organizer/dashboard/institute/tournaments/${t.id}`,
        });
      }
    }
  });
}

export function notifyPenaltyRevoked(penaltyId: string) {
  return safely("penalty revoked", async () => {
    const p = await prisma.penalty.findUnique({
      where: { id: penaltyId },
      select: {
        kind: true,
        registration: { select: { player: { select: { userId: true } }, tournament: { select: { id: true, name: true } } } },
      },
    });
    if (!p?.registration.player) return;
    await notify(p.registration.player.userId, {
      type: "penalty_revoked",
      title: `A penalty in "${p.registration.tournament.name}" was withdrawn`,
      body: p.kind === "disqualification" ? "You're back in the tournament." : undefined,
      href: `/tournaments/${p.registration.tournament.id}`,
    });
  });
}
