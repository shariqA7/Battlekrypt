// Ensures a matching row exists in our own `User` table for a given
// Supabase-authenticated user. Supabase's `auth.users` table is the source
// of truth for credentials, but our app data (registrations, organizer
// profiles, etc.) needs a local User row to attach foreign keys to.
//
// Called centrally from the auth callback route right after login/signup,
// so by the time any other route runs, the User row is guaranteed to exist.
import { prisma } from "@/lib/prisma";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export async function ensureUserRecord(user: SupabaseUser) {
  // Uses || (not ??) so an empty string from a provider counts as "missing"
  // too, not just null/undefined. Falls back to a synthetic name derived
  // from the user's own ID as a last resort — this never depends on
  // anything a provider (Google/Discord/email) might fail to return.
  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    `Player_${user.id.slice(0, 8)}`;

  return prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email || undefined,
    },
    create: {
      id: user.id,
      email: user.email || undefined,
      displayName,
      avatarUrl: user.user_metadata?.avatar_url || undefined,
    },
  });
}