import { SUPPORTED_CURRENCIES } from "@/lib/money";

export const POSTER_TYPES = ["player", "club", "organizer"] as const;
export const ENTRANT_TYPES = ["player", "team", "either"] as const;
export const PRIZE_TYPES = ["cash", "in_game", "reward"] as const;

export type PosterType = (typeof POSTER_TYPES)[number];
export type EntrantType = (typeof ENTRANT_TYPES)[number];
export type PrizeType = (typeof PRIZE_TYPES)[number];

export interface ChallengeInput {
  postAs: PosterType;
  title: string;
  description: string;
  gameId: string;
  entrantType: EntrantType;
  minRating: number | null;
  slots: number;
  maxApplicants: number;
  openDays: number; // how long applications stay open
  completeWithinDays: number; // time the chosen challenger(s) get
  prizeType: PrizeType;
  prizeDescription: string;
  cashAmount: number | null;
  cashCurrency: string | null;
  prizeEstimatedUsd: number | null; // in-game prizes only
  payoutMethod: string;
  acceptTerms: boolean;
}

export type ChallengeFieldErrors = Partial<Record<keyof ChallengeInput, string>>;

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const int = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

export function validateChallenge(
  body: unknown
): { data: ChallengeInput } | { errors: ChallengeFieldErrors } {
  const b = (body ?? {}) as Record<string, unknown>;
  const e: ChallengeFieldErrors = {};

  const postAs = str(b.postAs) as PosterType;
  if (!(POSTER_TYPES as readonly string[]).includes(postAs)) e.postAs = "Choose who is posting.";

  const title = str(b.title);
  if (title.length < 5 || title.length > 80) e.title = "Title must be 5–80 characters.";

  const description = str(b.description);
  if (description.length < 20 || description.length > 1500) {
    e.description = "Explain what has to be done to win (20–1500 characters).";
  }

  const gameId = str(b.gameId);
  if (!gameId) e.gameId = "Choose the game.";

  const entrantType = (str(b.entrantType) || "either") as EntrantType;
  if (!(ENTRANT_TYPES as readonly string[]).includes(entrantType)) e.entrantType = "Choose who can take it on.";

  let minRating: number | null = null;
  if (b.minRating !== undefined && b.minRating !== null && String(b.minRating).trim() !== "") {
    const n = int(b.minRating);
    if (!Number.isInteger(n) || n < 0 || n > 5000) e.minRating = "Minimum rating must be a whole number from 0 to 5000.";
    else minRating = n;
  }

  const slots = int(b.slots);
  if (!Number.isInteger(slots) || slots < 1 || slots > 10) e.slots = "Slots must be 1–10.";
  const maxApplicants = int(b.maxApplicants);
  if (!Number.isInteger(maxApplicants) || maxApplicants < 1 || maxApplicants > 50) {
    e.maxApplicants = "Applications cap must be 1–50.";
  } else if (Number.isInteger(slots) && maxApplicants < slots) {
    e.maxApplicants = "The applications cap can't be lower than the number of slots.";
  }

  const openDays = int(b.openDays);
  if (!Number.isInteger(openDays) || openDays < 1 || openDays > 30) e.openDays = "Applications can stay open 1–30 days.";
  const completeWithinDays = int(b.completeWithinDays);
  if (!Number.isInteger(completeWithinDays) || completeWithinDays < 1 || completeWithinDays > 60) {
    e.completeWithinDays = "Time to complete must be 1–60 days.";
  }

  const prizeType = str(b.prizeType) as PrizeType;
  if (!(PRIZE_TYPES as readonly string[]).includes(prizeType)) e.prizeType = "Choose the prize type.";

  const prizeDescription = str(b.prizeDescription);
  if (prizeDescription.length < 3 || prizeDescription.length > 200) e.prizeDescription = "Describe the prize (3–200 characters).";

  let cashAmount: number | null = null;
  let cashCurrency: string | null = null;
  let prizeEstimatedUsd: number | null = null;
  if (prizeType === "cash") {
    const amt = int(b.cashAmount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000_000) e.cashAmount = "Enter the prize amount.";
    else cashAmount = Math.round(amt * 100) / 100;
    const cur = str(b.cashCurrency);
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(cur)) e.cashCurrency = "Choose a currency.";
    else cashCurrency = cur;
  } else if (prizeType === "in_game") {
    // In-game prizes (UC, RP, items) have no price, so the poster estimates
    // their dollar value — that is what the plan's prize cap is checked against.
    const est = int(b.prizeEstimatedUsd);
    if (!Number.isFinite(est) || est <= 0 || est > 1_000_000) e.prizeEstimatedUsd = "Estimate the prize's value in US dollars.";
    else prizeEstimatedUsd = Math.round(est * 100) / 100;
  }

  const payoutMethod = str(b.payoutMethod);
  if (payoutMethod.length < 3 || payoutMethod.length > 200) {
    e.payoutMethod = "Say how you'll pay or deliver the prize (e.g. JazzCash or bank transfer, PKR).";
  }

  // The poster must tick the terms box (see lib/challenge-terms.ts).
  const acceptTerms = b.acceptTerms === true;
  if (!acceptTerms) e.acceptTerms = "Please read and accept the terms to post.";

  if (Object.keys(e).length) return { errors: e };
  return {
    data: {
      postAs, title, description, gameId, entrantType, minRating, slots, maxApplicants,
      openDays, completeWithinDays, prizeType, prizeDescription, cashAmount, cashCurrency,
      prizeEstimatedUsd, payoutMethod, acceptTerms,
    },
  };
}
