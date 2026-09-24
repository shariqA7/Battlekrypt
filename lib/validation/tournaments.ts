import { z } from "zod";

const currencySchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1).max(10),
});

export const createTournamentSchema = z.object({
  gameId: z.string().min(1, "gameId is required"),
  name: z.string().trim().min(1, "name is required").max(120),
  description: z.string().max(2000).optional(),
  bannerUrl: z.string().url().optional(),
  type: z.enum(["tournament", "league", "scrim"]),
  mode: z.enum(["solo", "duo", "squad"]),
  maxTeamSize: z.number().int().min(1).max(100).optional(),
  maxTeams: z.number().int().min(1, "maxTeams must be at least 1"),
  playersPerRoom: z.number().int().min(1).optional(),
  format: z.enum([
    "single_elimination",
    "double_elimination",
    "round_robin",
    "points_table",
    "league_format",
  ]),
  entryType: z.enum(["free", "paid"]),
  entryFee: currencySchema.optional(),
  paymentInstructions: z.string().trim().max(500).optional(),
  prizePool: currencySchema.optional(),
  customFields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.string(),
        required: z.boolean().optional(),
      })
    )
    .optional(),
  rules: z.array(z.string()).optional(),
  startAt: z.string().datetime().optional(),
});

// All fields optional here — this is PATCH, every field is a partial update.
export const updateTournamentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(2000).optional(),
  bannerUrl: z.string().url().optional(),
  maxTeams: z.number().int().min(1).optional(),
  playersPerRoom: z.number().int().min(1).optional(),
  entryFee: currencySchema.optional(),
  paymentInstructions: z.string().trim().max(500).optional(),
  prizePool: currencySchema.optional(),
  startAt: z.string().datetime().optional(),
});

export const registerSchema = z.object({
  customFieldResponses: z.record(z.string(), z.string()).optional(),
  paymentProofUrl: z.string().url().optional(),
  teamName: z.string().trim().min(1).max(60).optional(),
  teamMemberPlayerIds: z.array(z.string()).optional(),
});

export const organizerOnboardSchema = z.object({
  orgName: z.string().trim().min(1, "orgName is required").max(100),
  bio: z.string().max(1000).optional(),
});

export const updatePlayerProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  avatarUrl: z.string().url().optional(),
  mobileNumber: z.string().max(30).optional(),
  region: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  age: z.number().int().min(0).max(150).optional(),
  gender: z.string().max(30).optional(),
  hobbies: z.string().max(1000).optional(),
  favoriteGames: z.array(z.string()).optional(),
});

// Shared helper: runs a schema against a parsed body, returning either the
// validated data or a ready-to-return 400 NextResponse. Keeps every route
// handler's validation block to two lines instead of repeating try/catch.
export function formatZodError(error: z.ZodError) {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}
