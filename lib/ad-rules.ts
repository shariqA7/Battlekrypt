// Ads: the pure rules (no database, no React), shared by the admin form, the API, the page that
// picks which ad to show, and the tests.
import { isSupportedCurrency } from "@/lib/money";

export const AD_PLACEMENTS = ["browse", "tournament_detail", "dashboard"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];
export const AD_PLACEMENT_LABEL: Record<AdPlacement, string> = {
  browse: "Browse pages (tournament list, Live)",
  tournament_detail: "Tournament page",
  dashboard: "Dashboards (player, organizer, club)",
};

export const AD_AUDIENCES = ["all", "player", "organizer"] as const;
export type AdAudience = (typeof AD_AUDIENCES)[number];
export const AD_AUDIENCE_LABEL: Record<AdAudience, string> = {
  all: "Everyone",
  player: "Players (and visitors)",
  organizer: "Organizers",
};

/** What a viewer is: a visitor counts as a player. A person with both profiles is both. */
export type AdViewer = { player: boolean; organizer: boolean };

export type CampaignShape = {
  active: boolean; startsAt: Date; endsAt: Date | null; placements: string[]; audience: string; weight: number;
};

export function isLive(c: Pick<CampaignShape, "active" | "startsAt" | "endsAt">, now = new Date()): boolean {
  return c.active && c.startsAt <= now && (c.endsAt === null || c.endsAt > now);
}

export function matchesViewer(audience: string, v: AdViewer): boolean {
  if (audience === "organizer") return v.organizer;
  if (audience === "player") return v.player;
  return true;
}

/** Weighted random pick: weight 3 comes up three times as often as weight 1. `random` is injectable for tests. */
export function pickWeighted<T extends { weight: number }>(items: T[], random: () => number = Math.random): T | null {
  const pool = items.filter((i) => i.weight > 0);
  if (pool.length === 0) return null;
  const total = pool.reduce((n, i) => n + i.weight, 0);
  let r = random() * total;
  for (const i of pool) {
    r -= i.weight;
    if (r < 0) return i;
  }
  return pool[pool.length - 1];
}

const httpsUrl = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  if (!/^https:\/\/[^\s]+$/.test(t) || t.length > 600) return null;
  try { return new URL(t).protocol === "https:" ? t : null; } catch { return null; }
};

export type CampaignInput = {
  name: string; advertiser: string; imageUrl: string; linkUrl: string; altText: string;
  placements: AdPlacement[]; audience: AdAudience; startsAt: Date; endsAt: Date | null; weight: number; active: boolean;
  paidAmount: number | null; paidCurrency: string | null;
};
type Result = { ok: true; value: CampaignInput } | { ok: false; message: string };

const text = (v: unknown, min: number, max: number) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t.length >= min && t.length <= max ? t : null;
};
const asDate = (v: unknown): Date | null | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export function validateCampaign(raw: Record<string, unknown>, now = new Date()): Result {
  const name = text(raw.name, 2, 80);
  if (!name) return { ok: false, message: "Give the campaign a name (2–80 characters)." };
  const advertiser = text(raw.advertiser, 2, 80);
  if (!advertiser) return { ok: false, message: "Enter the advertiser's name (2–80 characters)." };
  const imageUrl = httpsUrl(raw.imageUrl);
  if (!imageUrl) return { ok: false, message: "Upload the banner image (it must be a public https link)." };
  const linkUrl = httpsUrl(raw.linkUrl);
  if (!linkUrl) return { ok: false, message: "The link must start with https://" };
  const altText = text(raw.altText, 2, 120);
  if (!altText) return { ok: false, message: "Describe the banner in a few words (2–120 characters), for screen readers." };

  const placements = Array.isArray(raw.placements) ? [...new Set(raw.placements.filter((p): p is AdPlacement => AD_PLACEMENTS.includes(p as AdPlacement)))] : [];
  if (placements.length === 0) return { ok: false, message: "Choose at least one place to show the banner." };
  const audience = raw.audience === undefined ? "all" : raw.audience;
  if (!AD_AUDIENCES.includes(audience as AdAudience)) return { ok: false, message: "Unknown audience." };

  const startsAt = asDate(raw.startsAt);
  if (startsAt === null) return { ok: false, message: "The start date isn't a valid date." };
  const endsAt = asDate(raw.endsAt);
  if (endsAt === null) return { ok: false, message: "The end date isn't a valid date." };
  const start = startsAt ?? now;
  if (endsAt && endsAt <= start) return { ok: false, message: "The end date must be after the start date." };

  const weight = raw.weight === undefined || raw.weight === "" ? 1 : Number(raw.weight);
  if (!Number.isInteger(weight) || weight < 1 || weight > 10) return { ok: false, message: "Weight must be a whole number from 1 to 10." };

  let paidAmount: number | null = null;
  let paidCurrency: string | null = null;
  if (raw.paidAmount !== undefined && raw.paidAmount !== null && raw.paidAmount !== "") {
    const n = Number(raw.paidAmount);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) return { ok: false, message: "The amount paid isn't a valid number." };
    if (!isSupportedCurrency(raw.paidCurrency)) return { ok: false, message: "Choose the currency of the amount paid." };
    paidAmount = Math.round(n * 100) / 100;
    paidCurrency = raw.paidCurrency as string;
  }

  return {
    ok: true,
    value: { name, advertiser, imageUrl, linkUrl, altText, placements, audience: audience as AdAudience, startsAt: start, endsAt: endsAt ?? null, weight, active: raw.active !== false, paidAmount, paidCurrency },
  };
}

// ---- Google AdSense (optional fallback) ----
// Google requires a consent mechanism (a certified CMP) for personalised ads to visitors in the EEA,
// UK and Switzerland. Until the admin confirms one is live, AdSense is not shown there (sponsor
// banners set no cookies and still are).
export const ADSENSE_BLOCKED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
]);
/**
 * Whether AdSense may be shown to a visitor in this country.
 * - Outside the EU, UK and Switzerland: yes.
 * - Inside them (or country unknown): only once the admin confirms a consent message is live
 *   (`euConsentReady`). An unknown country is treated as European: better to show nothing than to break the rule.
 */
export const adsenseAllowedIn = (country: string | null | undefined, euConsentReady = false) =>
  euConsentReady || (!!country && !ADSENSE_BLOCKED_COUNTRIES.has(country.toUpperCase()));

/** The ads.txt line AdSense asks for. f08c47fec0942fa0 is Google's own certification authority ID. */
export const adsTxtLine = (clientId: string | null | undefined) =>
  clientId && /^ca-pub-\d{10,20}$/.test(clientId) ? `google.com, ${clientId.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : null;

export type AdsenseSettings = { adsenseClientId: string | null; adsenseSlotBrowse: string | null; adsenseSlotTournament: string | null; adsenseSlotDashboard: string | null };
export type AdsenseUpdate = Partial<AdsenseSettings> & { adsenseEuConsentReady?: boolean };
const optional = (v: unknown, re: RegExp): string | null | undefined => {
  if (v === undefined) return undefined;
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return null;
  return re.test(t) ? t : undefined;
};
export function validateAdsense(raw: Record<string, unknown>): { ok: true; value: AdsenseUpdate } | { ok: false; message: string } {
  const out: AdsenseUpdate = {};
  if (raw.adsenseEuConsentReady !== undefined) {
    if (typeof raw.adsenseEuConsentReady !== "boolean") return { ok: false, message: "Invalid consent setting." };
    out.adsenseEuConsentReady = raw.adsenseEuConsentReady;
  }
  const fields: [keyof AdsenseSettings, RegExp, string][] = [
    ["adsenseClientId", /^ca-pub-\d{10,20}$/, "The publisher ID looks like ca-pub-1234567890123456."],
    ["adsenseSlotBrowse", /^\d{6,20}$/, "Ad unit IDs are numbers (about 10 digits)."],
    ["adsenseSlotTournament", /^\d{6,20}$/, "Ad unit IDs are numbers (about 10 digits)."],
    ["adsenseSlotDashboard", /^\d{6,20}$/, "Ad unit IDs are numbers (about 10 digits)."],
  ];
  for (const [key, re, msg] of fields) {
    if (raw[key] === undefined) continue;
    const v = optional(raw[key], re);
    if (v === undefined) return { ok: false, message: msg };
    out[key] = v;
  }
  return { ok: true, value: out };
}
export const adsenseSlotFor = (s: AdsenseSettings, placement: AdPlacement) =>
  placement === "browse" ? s.adsenseSlotBrowse : placement === "tournament_detail" ? s.adsenseSlotTournament : s.adsenseSlotDashboard;
