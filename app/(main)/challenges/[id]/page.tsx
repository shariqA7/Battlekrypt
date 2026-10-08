import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getChallengeForViewer } from "@/lib/services/challenges";
import { getApplyState, listApplicants } from "@/lib/services/challenge-applications";
import { getEntriesForViewer, getPosterRecord, isPosterFrozen } from "@/lib/services/challenge-fulfillment";
import { prizeLabel, POSTER_LABEL, ENTRANT_LABEL } from "@/lib/challenge-format";
import CancelButton from "./CancelButton";
import ApplyPanel from "./ApplyPanel";
import ApplicantsPanel from "./ApplicantsPanel";
import EntryPanel from "./EntryPanel";
import ReportButton from "./ReportButton";
import { isUnderReview } from "@/lib/services/challenge-moderation";
import { CHALLENGE_NOTICE } from "@/lib/challenge-terms";

const STATUS_NOTE: Record<string, { text: string; tone: "gold" | "live" | "muted" }> = {
  pending_review: { text: "Waiting for admin approval — this prize is above the review limit. It goes live once approved.", tone: "gold" },
  rejected: { text: "An admin rejected this challenge.", tone: "live" },
  cancelled: { text: "This challenge was cancelled.", tone: "muted" },
  removed: { text: "An admin removed this challenge after reports.", tone: "live" },
  expired: { text: "Applications closed before anyone was chosen.", tone: "muted" },
  completed: { text: "This challenge has been completed.", tone: "muted" },
};

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const record = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, isAdmin: true } }) : null;

  const found = await getChallengeForViewer(id, record);
  if (!found) notFound();
  const { challenge: c, isPoster } = found;

  const note = STATUS_NOTE[c.status];
  const applicants = isPoster ? await listApplicants(c.id) : [];
  const apply = user && !isPoster ? await getApplyState(user.id, c) : null;
  // "Join" is shown for open challenges. Whether the viewer's plan allows it
  // decides between the application form and the upgrade prompt.
  const acceptingApplications = c.status === "open" && c.applicationsCloseAt > new Date();
  const showExisting = !!apply?.existing;

  // Picked challengers' progress: the poster sees all of it, a challenger only their own.
  const myEntry = !isPoster && apply?.existing?.status === "selected";
  const entries = user && (isPoster || myEntry) ? await getEntriesForViewer(c.id, user.id, isPoster) : [];
  const [posterRecord, frozen] = await Promise.all([getPosterRecord(c.posterUserId), isPosterFrozen(c.posterUserId)]);
  const prizeType = c.prizeType as "cash" | "in_game" | "reward";
  const underReview = c.status === "open" && (await isUnderReview(c.id));

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/challenges" className="font-sans text-[12px] text-bk-muted underline">← Challenges</Link>

      {note && (
        <p className={`mt-4 font-sans text-[13px] px-3 py-2 ${note.tone === "live" ? "bg-bk-live-bg text-bk-live" : note.tone === "gold" ? "bg-[rgba(239,159,39,0.12)] text-[#EF9F27]" : "bg-bk-surface text-bk-muted"}`}>
          {note.text}
          {c.reviewNote && ` Reason: ${c.reviewNote}`}
        </p>
      )}

      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-4 mb-1">{c.title}</h1>
      <p className="font-sans text-[13px] text-bk-muted mb-5">
        {c.game.name} · {POSTER_LABEL[c.posterType]}: {c.posterName}
      </p>
      <p className="font-sans text-[12px] text-bk-muted -mt-3 mb-5">
        Poster record: {posterRecord.completed} prize{posterRecord.completed === 1 ? "" : "s"} settled
        {posterRecord.paymentDisputesLost > 0 ? ` · ${posterRecord.paymentDisputesLost} payment dispute${posterRecord.paymentDisputesLost === 1 ? "" : "s"} lost` : ""}
      </p>
      {underReview && (
        <p className="mb-5 font-sans text-[13px] px-3 py-2 bg-[rgba(239,159,39,0.12)] text-[#EF9F27]">
          This challenge is being reviewed after reports. Applications are paused until an admin has looked.
        </p>
      )}
      {frozen && (
        <p className="mb-5 font-sans text-[13px] px-3 py-2 bg-[rgba(239,159,39,0.12)] text-[#EF9F27]">
          {isPoster
            ? "Your challenges are paused while a payment dispute is settled. You can't post or take applications until then."
            : "This poster's challenges are temporarily paused."}
        </p>
      )}

      <div className="bg-bk-surface border border-bk-border p-4 mb-5">
        <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted">Prize</p>
        <p className="font-sans font-extrabold text-xl text-bk-gold-light">{prizeLabel(c)}</p>
        {c.prizeType !== "cash" && <p className="font-sans text-[12px] text-bk-muted mt-0.5">{c.prizeType === "in_game" ? "In-game prize" : "Reward"}</p>}
        <p className="font-sans text-[12px] text-bk-body mt-2">Paid or delivered by the poster: {c.payoutMethod}</p>
      </div>

      <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mb-5">{c.description}</p>
      <p className="font-sans text-[11px] text-bk-muted mb-5">{CHALLENGE_NOTICE}</p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 font-sans text-[12px] mb-6">
        <dt className="text-bk-muted">Slots</dt><dd className="text-bk-heading">{c.slots}</dd>
        <dt className="text-bk-muted">Applications allowed</dt><dd className="text-bk-heading">{c.maxApplicants}</dd>
        <dt className="text-bk-muted">Open to</dt><dd className="text-bk-heading">{ENTRANT_LABEL[c.entrantType]}</dd>
        <dt className="text-bk-muted">Minimum rating</dt><dd className="text-bk-heading">{c.minRating ?? "None"}</dd>
        <dt className="text-bk-muted">Applications close</dt><dd className="text-bk-heading">{c.applicationsCloseAt.toLocaleString()}</dd>
        <dt className="text-bk-muted">Time to complete</dt><dd className="text-bk-heading">{c.completeWithinDays} days after being chosen</dd>
      </dl>

      {isPoster ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <p className="font-sans text-[12px] text-bk-muted">This is your challenge.</p>
            {(c.status === "open" || c.status === "pending_review") && <CancelButton id={c.id} />}
          </div>
          {c.status === "in_progress" && c.completeBy && (
            <p className="font-sans text-[13px] text-bk-body">
              Challenger{c.slots > 1 ? "s" : ""} chosen. They have until {c.completeBy.toLocaleString()} to complete it.
            </p>
          )}
          {c.status === "open" && (
            <ApplicantsPanel challengeId={c.id} slots={c.slots} applicants={applicants} canPick />
          )}
          {entries.length > 0 && (
            <div className="space-y-3">
              <p className="font-sans font-medium text-bk-heading text-sm">Challengers</p>
              {entries.map((en) => <EntryPanel key={en.id} entry={en} role="poster" prizeType={prizeType} />)}
            </div>
          )}
          {c.status === "open" && !acceptingApplications && applicants.length > 0 && (
            <p className="font-sans text-[12px] text-bk-muted">
              Applications are closed. Pick within 7 days of the close date or the challenge expires.
            </p>
          )}
        </div>
      ) : showExisting && apply?.existing && !["withdrawn", "not_selected"].includes(apply.existing.status) ? (
        <>
          <ApplyPanel challengeId={c.id} existing={apply.existing} player={apply.player} teams={apply.teams} />
          {entries.length > 0 && (
            <div className="space-y-3 mt-4">
              <p className="font-sans font-medium text-bk-heading text-sm">Your entry</p>
              {entries.map((en) => <EntryPanel key={en.id} entry={en} role="challenger" prizeType={prizeType} />)}
            </div>
          )}
        </>
      ) : acceptingApplications ? (
        !user ? (
          <Link href={`/login?redirectTo=/challenges/${c.id}`} className="inline-block bg-white text-bk-bg font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-5 py-2.5">
            Sign in to join
          </Link>
        ) : apply?.planBlocked ? (
          <div>
            <Link href="/plans" className="inline-block bg-white text-bk-bg font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-5 py-2.5">
              Upgrade to join
            </Link>
            <p className="font-sans text-[12px] text-bk-muted mt-2">
              Joining challenges needs a paid plan. Tournaments stay free for everyone.
            </p>
          </div>
        ) : apply ? (
          <ApplyPanel challengeId={c.id} existing={apply.existing} player={apply.player} teams={apply.teams} />
        ) : null
      ) : null}
      {user && !isPoster && ["open", "in_progress", "completed"].includes(c.status) && <ReportButton challengeId={c.id} />}
    </main>
  );
}
