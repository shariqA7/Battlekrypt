import { NextResponse } from "next/server";
import type { GiveawayError } from "@/lib/services/giveaways";

const MESSAGES: Record<string, { status: number; message: string }> = {
  feature_off: { status: 403, message: "Giveaways are switched off right now." },
  not_found: { status: 404, message: "Not found." },
  forbidden: { status: 403, message: "You can't do that." },
  not_organizer: { status: 403, message: "Only organizations can run giveaways." },
  not_approved: { status: 403, message: "Your organization needs admin approval before it can run giveaways." },
  paused: { status: 403, message: "New giveaways are paused while an admin reviews player reports about your events." },
  held: { status: 403, message: "You can't start a giveaway until your earlier prize payouts are settled." },
  not_graduated: { status: 403, message: "New organizers can run giveaways once their identity is verified or enough of their prize events are fully confirmed (the same bar as lifting the new-organizer limits)." },
  frozen: { status: 403, message: "You can't start a giveaway while a payment dispute against you is unresolved." },
  monthly_limit: { status: 403, message: "You've used this month's giveaways for your plan. Upgrade your plan to run more." },
  closed: { status: 409, message: "This giveaway has closed." },
  not_started: { status: 409, message: "This giveaway hasn't started yet." },
  host: { status: 403, message: "You can't enter a giveaway you run or help run, and admins can't enter." },
  not_verified: { status: 403, message: "This giveaway is for verified members. Get a paid plan to enter, then try again." },
  tournament_required: { status: 403, message: "Only players who took part in the linked tournament can enter this giveaway." },
  age_restricted: { status: 403, message: "Cash prizes are for players 18 and over. Add your age to your profile first." },
  already_entered: { status: 409, message: "You've already entered this giveaway." },
  not_drawn: { status: 409, message: "The winners haven't been drawn yet." },
  already_drawn: { status: 409, message: "The winners were already drawn." },
  too_early: { status: 409, message: "Not yet: the giveaway is still open (or the winner still has time to answer)." },
  bad_state: { status: 409, message: "That can't be done at this stage. Refresh the page and check its status." },
  no_replacement: { status: 409, message: "There is nobody left to draw." },
  expired: { status: 409, message: "The time to send your details has passed. Contact the host." },
};

export function giveawayError(result: GiveawayError) {
  const m = MESSAGES[result.error];
  const message = "message" in result ? result.message : (m?.message ?? "Invalid request.");
  return NextResponse.json({ error: { code: result.error, message } }, { status: m?.status ?? 400 });
}

// The same wording, for pages that explain why something isn't possible.
export function giveawayMessage(code: string) {
  return MESSAGES[code]?.message ?? "That isn't possible right now.";
}
