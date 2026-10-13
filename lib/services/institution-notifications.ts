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

