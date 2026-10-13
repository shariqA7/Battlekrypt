// Pure helpers behind the tournament page (D3): what the Stage Rail shows, the
// date range under the title, and what the main button says. No React, no
// database, so they are easy to test.

export type RailState = "done" | "live" | "upcoming";

export interface RailNode {
  key: string;
  label: string;
  state: RailState;
  // Shown under the label: "Closed", "Live now", "Starts Oct 26"... The date
  // itself is passed separately so the page can format it in the viewer's
  // own time zone.
  note: "open" | "closed" | "live" | "starts" | "ended" | "tba";
  date: Date | null;
  last: boolean; // the final stage gets the trophy icon
}

interface StageLike {
  id: string;
  name: string;
  order: number;
  startAt: Date | null;
  status: string | null;
}

const LIVE_WORDS = ["live", "in_progress", "ongoing", "running", "active"];
const DONE_WORDS = ["completed", "complete", "done", "finished", "ended"];

export function buildRail(
  tournament: { status: string; startAt: Date | null },
  stages: StageLike[],
  now: Date = new Date()
): RailNode[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const finished = tournament.status === "completed";
  const registrationOpen = ["published", "registration_open"].includes(tournament.status);

  const nodes: RailNode[] = [
    {
      key: "registration",
      label: "Registration",
      state: registrationOpen ? "live" : "done",
      note: registrationOpen ? "open" : "closed",
      date: null,
      last: false,
    },
  ];

  // Which stage is "live": an explicit status wins; otherwise, once the event
  // is in progress, it is the latest stage whose start time has passed.
  const explicit = (s: StageLike) => (s.status ?? "").toLowerCase();
  let liveIndex = ordered.findIndex((s) => LIVE_WORDS.includes(explicit(s)));
  if (liveIndex === -1 && tournament.status === "in_progress") {
    ordered.forEach((s, i) => {
      if (s.startAt && s.startAt <= now && !DONE_WORDS.includes(explicit(s))) liveIndex = i;
    });
  }

  ordered.forEach((s, i) => {
    const isLast = i === ordered.length - 1;
    let state: RailState;
    if (finished || DONE_WORDS.includes(explicit(s))) state = "done";
    else if (i === liveIndex) state = "live";
    else if (liveIndex !== -1 && i < liveIndex) state = "done";
    else state = "upcoming";

    nodes.push({
      key: s.id,
      label: s.name,
      state,
      note: state === "live" ? "live" : state === "done" ? "ended" : s.startAt ? "starts" : "tba",
      date: s.startAt,
      last: isLast,
    });
  });

  return nodes;
}

// "Oct 24 – Oct 28": from the tournament start to the last stage start.
export function eventDateRange(
  tournament: { startAt: Date | null },
  stages: { startAt: Date | null }[]
): { from: Date; to: Date | null } | null {
  const times = [tournament.startAt, ...stages.map((s) => s.startAt)].filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  if (times.length === 0) return null;
  const from = times[0];
  const to = times[times.length - 1];
  return { from, to: to.getTime() === from.getTime() ? null : to };
}

export type Cta =
  | { kind: "join"; label: string }
  | { kind: "closed"; label: string };

export function ctaFor(tournament: { status: string; maxTeams: number }, registrations: number): Cta {
  if (["published", "registration_open"].includes(tournament.status)) {
    if (registrations >= tournament.maxTeams) return { kind: "closed", label: "Full" };
    return { kind: "join", label: "Enter now" };
  }
  if (tournament.status === "registration_closed") return { kind: "closed", label: "Registration closed" };
  if (tournament.status === "in_progress") return { kind: "closed", label: "Live now" };
  if (tournament.status === "completed") return { kind: "closed", label: "Completed" };
  if (tournament.status === "cancelled") return { kind: "closed", label: "Cancelled" };
  return { kind: "closed", label: "Not open yet" };
}
