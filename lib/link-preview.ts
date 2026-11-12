import type { Metadata } from "next";
import { getBranding } from "@/lib/services/branding";

// Link previews (WhatsApp, Facebook, Discord, Telegram, X, LinkedIn...).
//
// Picture shown when a link is shared:
//   1. the page's own image, when it has one (a tournament / scrim / league banner, a giveaway prize photo)
//   2. otherwise the platform: the share image from Admin > Settings > Branding, or, if none is
//      uploaded, the platform logo from the same page.
//
// These sites can't draw SVG, so an SVG logo is skipped (upload a PNG or JPG for the share image or logo).
const SITE_NAME = "BattleKrypt";

const usable = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.pathname.toLowerCase().endsWith(".svg")) return null;
    return u.toString();
  } catch {
    return null;
  }
};

type Picture = { url: string; width?: number; height?: number; wide: boolean };

/** The platform's own preview picture: share image first, then the logo. */
export async function platformPicture(): Promise<Picture | null> {
  const b = await getBranding();
  const share = usable(b.shareImageUrl);
  if (share) return { url: share, width: 1200, height: 630, wide: true };
  const logo = usable(b.logoUrl) ?? usable(b.logoLightUrl);
  return logo ? { url: logo, wide: false } : null;
}

/** Full metadata for a page, using its own image when it has one and the platform picture when not. */
export async function previewMetadata(opts: {
  title: string;
  description: string;
  image?: string | null;
  /** Tab title when it should differ from the title shown in the preview. */
  tabTitle?: string;
}): Promise<Metadata> {
  const own = usable(opts.image);
  const pic: Picture | null = own ? { url: own, wide: true } : await platformPicture();
  const images = pic ? [{ url: pic.url, width: pic.width, height: pic.height }] : undefined;
  return {
    title: opts.tabTitle ?? opts.title,
    description: opts.description,
    openGraph: { title: opts.title, description: opts.description, siteName: SITE_NAME, type: "website", images },
    twitter: {
      card: pic?.wide ? "summary_large_image" : "summary",
      title: opts.title,
      description: opts.description,
      images: pic ? [pic.url] : undefined,
    },
  };
}

/** One-line plain-text blurb for a preview. */
export const blurb = (text: string | null | undefined, fallback: string, max = 200) => {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t ? (t.length > max ? `${t.slice(0, max - 1)}…` : t) : fallback;
};
