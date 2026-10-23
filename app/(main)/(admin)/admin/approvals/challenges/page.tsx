import { requireAdminPage } from "@/lib/admin-page";
import { getChallengeReviewUsd, listChallengesAwaitingReview } from "@/lib/services/challenges";
import { prizeLabel } from "@/lib/challenge-format";
import ChallengeReview from "../../ChallengeReview";

export default async function ApprovalsChallengeReviewPage() {
  await requireAdminPage();
  const [challengeReviewUsd, heldChallenges] = await Promise.all([getChallengeReviewUsd(), listChallengesAwaitingReview()]);

  return (
    <ChallengeReview
      thresholdUsd={challengeReviewUsd}
      initial={heldChallenges.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        gameName: c.game.name,
        posterName: c.posterName,
        posterType: c.posterType,
        posterEmail: c.poster.email,
        prizeLabel: prizeLabel(c),
        prizeUsd: c.prizeUsd?.toString() ?? null,
        payoutMethod: c.payoutMethod,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
