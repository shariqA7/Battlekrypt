// Who is looking, and from where, for hiding games that don't apply to them (lib/game-region.ts).
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getClientGeo } from "@/lib/geo";
import { pickViewerCountry, toCountryCode } from "@/lib/game-region";

export interface ViewerRegion {
  // The country to filter by (null = unknown). Ignored when showAll is true.
  country: string | null;
  // Admins see every game and tournament, or can preview as a country with ?as=IN.
  showAll: boolean;
  isAdmin: boolean;
}

export async function getViewerRegion(opts: { asCountry?: string | null } = {}): Promise<ViewerRegion> {
  const requestCountry = getClientGeo(await headers()).country;

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  if (!userId) return { country: pickViewerCountry({ requestCountry }), showAll: false, isAdmin: false };

  const [account, player, organizer] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    prisma.playerProfile.findUnique({ where: { userId }, select: { country: true } }),
    prisma.organizerProfile.findUnique({ where: { userId }, select: { country: true } }),
  ]);

  if (account?.isAdmin) {
    const preview = toCountryCode(opts.asCountry);
    return preview ? { country: preview, showAll: false, isAdmin: true } : { country: null, showAll: true, isAdmin: true };
  }
  return {
    country: pickViewerCountry({ profileCountry: player?.country, organizerCountry: organizer?.country, requestCountry }),
    showAll: false,
    isAdmin: false,
  };
}
