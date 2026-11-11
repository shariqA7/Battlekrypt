"use client";

import { useBranding } from "@/components/layout/BrandingProvider";

// The BattleKrypt logo, theme-aware: the dark-background and light-background
// logos swap with the theme, a single uploaded logo is used on both, and the
// built-in symbol is used until any logo is uploaded (Admin > Settings > Branding).
export function BrandLogo({
  className = "h-12 w-auto",
  symbolOnly = false,
  textFallback,
}: {
  className?: string;
  symbolOnly?: boolean;
  /** Shown instead of the built-in symbol while no logo has been uploaded. */
  textFallback?: string;
}) {
  const { logoUrl, logoLightUrl } = useBranding();
  const cls = `${className} object-contain`;
  if (!symbolOnly && !logoUrl && !logoLightUrl && textFallback) {
    return <span className="text-bk-gold-light font-sans font-extrabold text-lg">{textFallback}</span>;
  }
  if (symbolOnly || (!logoUrl && !logoLightUrl)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/symbol.png" alt="BattleKrypt" className={cls} />;
  }
  if (logoUrl && logoLightUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="BattleKrypt" className={`${cls} bk-logo-on-dark`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoLightUrl} alt="BattleKrypt" className={`${cls} bk-logo-on-light`} />
      </>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={(logoUrl ?? logoLightUrl)!} alt="BattleKrypt" className={cls} />;
}

// A tournament / league / scrim / challenge picture. Order of preference:
//   1. the organizer's own uploaded image
//   2. the admin's "Default tournament banner" (Admin > Settings > Branding)
//   3. the BattleKrypt logo, shown faint (30% opacity) on a plain panel so it is
//      clearly a placeholder and not mistaken for a real organizer logo
// `className` sets the size (e.g. "h-28 w-full"). `tile` is for small squares and
// shows the symbol instead of the wide logo.
export default function BannerImage({
  src,
  className = "w-full h-28",
  alt = "",
  tile = false,
}: {
  src?: string | null;
  className?: string;
  alt?: string;
  tile?: boolean;
}) {
  const { defaultBannerUrl } = useBranding();
  const image = src || defaultBannerUrl;
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={alt} className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex items-center justify-center overflow-hidden bg-gradient-to-br from-bk-surface-hover to-bk-bg`}>
      {/* Faded on purpose: it must read as a placeholder, never as the organizer's own logo. */}
      <BrandLogo symbolOnly={tile} className={`${tile ? "h-[60%] w-auto" : "h-[58%] w-auto max-w-[70%]"} opacity-30`} />
    </div>
  );
}
