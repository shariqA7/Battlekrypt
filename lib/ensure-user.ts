// Ensures matching User + PlayerProfile rows exist for a given
// Supabase-authenticated user. Supabase's `auth.users` table is the source
// of truth for credentials, but our app data (registrations, organizer
// profiles, extended player details) needs local rows to attach foreign
// keys to and to store things Supabase doesn't (favorite games, etc.).
//
// Called centrally from the auth callback route right after login/signup,
// so by the time any other route runs, both rows are guaranteed to exist.
//
// On first login, name/avatar are pulled from the OAuth provider (Google
// gives given_name/family_name separately; Discord usually only gives a
// single display name, so we best-effort split it). On every later login,
// only `email` is refreshed — a returning user's own edits via the profile
// page are never silently overwritten by provider data.
import { prisma } from "@/lib/prisma";
import type { User as SupabaseUser } from "@supabase/supabase-js";

function extractNameParts(user: SupabaseUser) {
  const meta = user.user_metadata ?? {};

  // Google provides these separately — most reliable source when present.
  if (meta.given_name || meta.family_name) {
    return { firstName: meta.given_name || "", lastName: meta.family_name || "" };
  }

  // Discord (and Google as a fallback) usually only gives one combined name.
  const fullName: string = meta.full_name || meta.name || "";
  if (fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
  }

  return { firstName: "", lastName: "" };
}

export async function ensureUserRecord(user: SupabaseUser) {
  const { firstName, lastName } = extractNameParts(user);

  const displayName =
    (firstName || lastName ? `${firstName} ${lastName}`.trim() : "") ||
    user.email ||
    `Player_${user.id.slice(0, 8)}`;

  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || undefined;

  const userRecord = await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email || undefined,
    },
    create: {
      id: user.id,
      email: user.email || undefined,
      displayName,
      avatarUrl,
    },
  });

  // Every user is a player by default — create the profile at the same
  // time, seeded with whatever name/avatar the provider gave us. Only done
  // on first creation (upsert's `update` branch is empty) so a returning
  // user's own profile edits are never overwritten by provider data.
  await prisma.playerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: firstName || null,
      lastName: lastName || null,
    },
  });

  return userRecord;
}
