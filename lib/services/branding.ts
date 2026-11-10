import { cache } from "react";
import { getSiteSettings } from "@/lib/services/tournaments";
import { BRANDING_KEYS, EMPTY_BRANDING, type Branding } from "@/lib/branding-shared";

export { BRANDING_KEYS, EMPTY_BRANDING };
export type { Branding, BrandingKey } from "@/lib/branding-shared";

// One database read per request, however many components ask. Never throws:
// a database hiccup must not take the whole page down just to skip a logo.
export const getBranding = cache(async (): Promise<Branding> => {
  try {
    const s = await getSiteSettings();
    const out = { ...EMPTY_BRANDING };
    for (const k of BRANDING_KEYS) out[k] = s[k] ?? null;
    return out;
  } catch {
    return EMPTY_BRANDING;
  }
});

// Accepts an https URL, or null/"" to clear a slot back to the built-in look.
export function cleanAssetUrl(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (typeof v !== "string" || v.length > 2000) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}