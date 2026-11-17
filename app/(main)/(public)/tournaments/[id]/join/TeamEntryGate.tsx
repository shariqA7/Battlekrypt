import Link from "next/link";
import type { TeamEntryState } from "@/lib/team-entry";

// Shown on the join page of a duo/squad game when the person can't enter a team yet.
// Each state has one clear next step. "next" brings them back to this join page afterwards.
export default function TeamEntryGate({
  state, gameName, clubName, ownsClub, next,
}: { state: Exclude<TeamEntryState, "ready">; gameName: string; clubName: string | null; ownsClub: boolean; next: string }) {
  const q = encodeURIComponent(next);
  const btn = "inline-block bg-bk-primary text-bk-on-primary font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 py-3";

  const copy: Record<typeof state, { title: string; body: string; action: { href: string; label: string } | null }> = {
    no_club: {
      title: "Team games are played with a club",
      body: `This is a team game, so you enter with a club team. Creating a club is free and takes a minute. After that, add a ${gameName} team and come back here to enter it.`,
      action: { href: `/club/register?next=${q}`, label: "Create a club" },
    },
    no_team_for_game: ownsClub
      ? {
          title: `${clubName ?? "Your club"} has no ${gameName} team yet`,
          body: `Add a ${gameName} team and your players to your club, then come back here to enter it.`,
          action: { href: `/club/dashboard?next=${q}`, label: `Add a ${gameName} team` },
        }
      : {
          title: `${clubName ?? "Your club"} has no ${gameName} team`,
          body: `Ask your club owner to add a ${gameName} team. Once it exists, anyone in the club can enter it here.`,
          action: null,
        },
    club_pending: {
      title: "Your club isn't active yet",
      body: "Your club is waiting for approval. Once it is active you can add a team and enter.",
      action: { href: "/club/dashboard", label: "Open club dashboard" },
    },
  };
  const c = copy[state];
  return (
    <div className="border border-bk-gold-light/40 bg-bk-bg px-4 py-4">
      <p className="font-sans text-[14px] text-bk-heading font-bold mb-1">{c.title}</p>
      <p className="font-sans text-[13px] text-bk-body mb-4">{c.body}</p>
      {c.action && <Link href={c.action.href} className={btn}>{c.action.label}</Link>}
    </div>
  );
}
