import { getBranding } from "@/lib/services/branding";

// The BattleKrypt logo from Admin > Settings > Branding, or the plain text
// wordmark while none is uploaded. Two logos (dark/light backgrounds) swap with
// the theme; a single logo is used on both. `className` styles the text
// fallback, `heightClass` sizes the image.
export default async function SiteLogo({
  heightClass = "h-8",
  className = "text-bk-gold-light font-sans font-extrabold text-2xl tracking-tight",
  fallbackText = "BattleKrypt",
}: {
  heightClass?: string;
  className?: string;
  fallbackText?: string;
}) {
  const { logoUrl, logoLightUrl } = await getBranding();
  const img = `${heightClass} w-auto max-w-[240px] object-contain`;

  if (!logoUrl && !logoLightUrl) return <span className={className}>{fallbackText}</span>;

  if (logoUrl && logoLightUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="BattleKrypt" className={`${img} bk-logo-on-dark`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoLightUrl} alt="BattleKrypt" className={`${img} bk-logo-on-light`} />
      </>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={(logoUrl ?? logoLightUrl)!} alt="BattleKrypt" className={img} />;
}
