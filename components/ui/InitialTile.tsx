"use client";

import { useBranding } from "@/components/layout/BrandingProvider";
import ThemedImage from "@/components/ui/ThemedImage";
import { PLACEHOLDERS } from "@/lib/placeholders";

// Square tile with 1-2 initials (logo/avatar fallback). Gold-tinted so it works
// on both themes; `round` is for people, square for organizations and games.
// With no image of its own, a round tile shows the admin-set default avatar and
// an `org`/`club` tile the default organizer/club logo. Each uses the admin-set
// default (Admin > Branding) or else the built-in placeholder artwork, which has
// a dark and a light version. Game
// tiles (no round/kind) keep their initials.
export default function InitialTile({
  name,
  size = 44,
  round = false,
  kind,
  src,
}: {
  name: string;
  size?: number;
  round?: boolean;
  kind?: "org" | "club";
  src?: string | null;
}) {
  const { defaultAvatarUrl, defaultOrgLogoUrl, defaultClubLogoUrl } = useBranding();
  // Own image, else the admin default for this kind of tile (null if none set).
  const image = src || (round ? defaultAvatarUrl : kind === "club" ? defaultClubLogoUrl : kind === "org" ? defaultOrgLogoUrl : null);
  // Built-in artwork for the kinds that have one; game tiles keep their initials.
  const builtin = round ? PLACEHOLDERS.avatar : kind === "club" ? PLACEHOLDERS.club : kind === "org" ? PLACEHOLDERS.org : null;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={`shrink-0 overflow-hidden flex items-center justify-center bg-bk-gold-from/15 border border-bk-gold-from/40 text-bk-gold-light font-sans font-bold ${round ? "rounded-full" : ""}`}
    >
      {image || builtin ? (
        <ThemedImage src={image} fallback={builtin ?? PLACEHOLDERS.avatar} />
      ) : (
        initials || "?"
      )}
    </div>
  );
}
