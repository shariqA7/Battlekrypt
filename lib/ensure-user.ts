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
  return prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
    },
    create: {
      id: user.id,
      email: user.email,
      displayName:
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email ??
        "New user",
      avatarUrl: user.user_metadata?.avatar_url,
    },
  });
}
