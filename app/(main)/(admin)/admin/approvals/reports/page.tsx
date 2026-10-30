import { requireAdminPage } from "@/lib/admin-page";
import { listReportedChallenges } from "@/lib/services/challenge-moderation";
import { listOpenFlags } from "@/lib/services/challenge-integrity";
import { prizeLabel } from "@/lib/challenge-format";
import ChallengeIntegrity from "../../ChallengeIntegrity";

export default async function ApprovalsReportsPage() {
  await requireAdminPage("approvals");
  const [reportedChallenges, openFlags] = await Promise.all([listReportedChallenges(), listOpenFlags()]);

  return (
    <ChallengeIntegrity
      reported={reportedChallenges.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        status: c.status,
        gameName: c.game.name,
        posterName: c.posterName,
        posterEmail: c.poster.email,
        prizeLabel: prizeLabel(c),
        reports: c.reports.map((r) => ({
          id: r.id,
          reason: r.reason,
          details: r.details,
          reporterEmail: r.reporter.email,
          createdAt: r.createdAt.toISOString(),
        })),
      }))}
      flags={openFlags.map((f) => ({
        id: f.id,
        kind: f.kind,
        details: f.details,
        createdAt: f.createdAt.toISOString(),
        challengeId: f.challengeId,
        challengeTitle: f.challenge?.title ?? "(deleted)",
        entryName: f.entry?.entrantName ?? "",
        entryStage: f.entry?.stage ?? "",
        posterEmail: f.posterEmail,
        challengerEmail: f.challengerEmail,
      }))}
    />
  );
}
