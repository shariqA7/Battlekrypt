// "Duplicate proof" warning shown next to a payment proof the reviewer is about to check.
// It is only a flag: the same file can be innocent, so the reviewer decides. It never says WHO
// else used the screenshot.
import type { ProofMatch } from "@/lib/proof-match";

export default function DuplicateProofBadge({ match, scope }: { match?: ProofMatch | null; scope: "organizer" | "admin" }) {
  if (!match) return null;
  const where = scope === "organizer" && match.sameOrganizer ? "on another entry at one of your events" : "on another payment";
  const who = match.sameUser ? " It came from the same account." : " It came from a different account.";
  return (
    <span
      title={`This exact screenshot file was also submitted ${where}.${who}`}
      className="font-sans font-bold text-[10px] uppercase tracking-[1px] px-2 py-1 bg-bk-amber/15 text-bk-amber"
    >
      Duplicate proof{match.count > 1 ? ` ×${match.count}` : ""}
    </span>
  );
}
