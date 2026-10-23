import { requireAdminPage } from "@/lib/admin-page";
import { getChallengeReviewUsd } from "@/lib/services/challenges";
import ChallengeSettings from "../../ChallengeSettings";

export default async function SettingsChallengesPage() {
  await requireAdminPage();
  const challengeReviewUsd = await getChallengeReviewUsd();
  return <ChallengeSettings initialUsd={challengeReviewUsd} />;
}
