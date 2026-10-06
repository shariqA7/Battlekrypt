// Countries and regions for tournament discovery (spec §3 "region" filter,
// Phase 8.5). A tournament stores one ISO-3166 alpha-2 country, or nothing =
// "worldwide / open to anyone". The broader REGION is derived from the
// country here, never stored, so regrouping a country is a one-line change.

export const REGIONS = [
  { key: "south-asia", label: "South Asia" },
  { key: "middle-east", label: "Middle East & North Africa" },
  { key: "southeast-asia", label: "Southeast Asia" },
  { key: "east-asia", label: "East Asia" },
  { key: "europe", label: "Europe" },
  { key: "north-america", label: "North America" },
  { key: "latin-america", label: "Latin America" },
  { key: "africa", label: "Sub-Saharan Africa" },
  { key: "oceania", label: "Oceania" },
] as const;

export type RegionKey = (typeof REGIONS)[number]["key"];

interface Country {
  name: string;
  region: RegionKey;
  // Suggested currency when an organizer picks this country (must be a
  // catalog currency; it's only ever a suggestion).
  currency?: string;
}

export const COUNTRIES: Record<string, Country> = {
  PK: { name: "Pakistan", region: "south-asia", currency: "PKR" },
  IN: { name: "India", region: "south-asia", currency: "INR" },
  BD: { name: "Bangladesh", region: "south-asia", currency: "BDT" },
  LK: { name: "Sri Lanka", region: "south-asia", currency: "LKR" },
  NP: { name: "Nepal", region: "south-asia", currency: "NPR" },
  SA: { name: "Saudi Arabia", region: "middle-east", currency: "SAR" },
  AE: { name: "United Arab Emirates", region: "middle-east", currency: "AED" },
  QA: { name: "Qatar", region: "middle-east", currency: "QAR" },
  KW: { name: "Kuwait", region: "middle-east", currency: "KWD" },
  BH: { name: "Bahrain", region: "middle-east", currency: "BHD" },
  OM: { name: "Oman", region: "middle-east", currency: "OMR" },
  EG: { name: "Egypt", region: "middle-east", currency: "EGP" },
  TR: { name: "Türkiye", region: "middle-east", currency: "TRY" },
  JO: { name: "Jordan", region: "middle-east" },
  IQ: { name: "Iraq", region: "middle-east" },
  MA: { name: "Morocco", region: "middle-east" },
  MY: { name: "Malaysia", region: "southeast-asia", currency: "MYR" },
  ID: { name: "Indonesia", region: "southeast-asia", currency: "IDR" },
  PH: { name: "Philippines", region: "southeast-asia", currency: "PHP" },
  TH: { name: "Thailand", region: "southeast-asia", currency: "THB" },
  VN: { name: "Vietnam", region: "southeast-asia", currency: "VND" },
  SG: { name: "Singapore", region: "southeast-asia", currency: "SGD" },
  CN: { name: "China", region: "east-asia" },
  JP: { name: "Japan", region: "east-asia" },
  KR: { name: "South Korea", region: "east-asia" },
  GB: { name: "United Kingdom", region: "europe", currency: "GBP" },
  DE: { name: "Germany", region: "europe", currency: "EUR" },
  FR: { name: "France", region: "europe", currency: "EUR" },
  ES: { name: "Spain", region: "europe", currency: "EUR" },
  IT: { name: "Italy", region: "europe", currency: "EUR" },
  NL: { name: "Netherlands", region: "europe", currency: "EUR" },
  PL: { name: "Poland", region: "europe" },
  SE: { name: "Sweden", region: "europe" },
  US: { name: "United States", region: "north-america", currency: "USD" },
  CA: { name: "Canada", region: "north-america", currency: "CAD" },
  MX: { name: "Mexico", region: "latin-america" },
  BR: { name: "Brazil", region: "latin-america" },
  AR: { name: "Argentina", region: "latin-america" },
  NG: { name: "Nigeria", region: "africa", currency: "NGN" },
  ZA: { name: "South Africa", region: "africa", currency: "ZAR" },
  KE: { name: "Kenya", region: "africa" },
  AU: { name: "Australia", region: "oceania", currency: "AUD" },
  NZ: { name: "New Zealand", region: "oceania" },
};

export function isCountryCode(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(COUNTRIES, v);
}
export function isRegionKey(v: unknown): v is RegionKey {
  return typeof v === "string" && REGIONS.some((r) => r.key === v);
}
export function countryName(code: string | null | undefined): string | null {
  return code && isCountryCode(code) ? COUNTRIES[code].name : null;
}
export function regionLabel(key: string): string {
  return REGIONS.find((r) => r.key === key)?.label ?? key;
}
export function countriesInRegion(key: RegionKey): string[] {
  return Object.entries(COUNTRIES).filter(([, c]) => c.region === key).map(([code]) => code);
}

// Organizer/player profiles store the country as free text ("Pakistan",
// "UAE", "pk"). Best-effort match to an ISO code; null when unsure.
const ALIASES: Record<string, string> = {
  uae: "AE", "u.a.e": "AE", emirates: "AE", "united arab emirates": "AE",
  uk: "GB", "great britain": "GB", england: "GB", "united kingdom": "GB",
  usa: "US", "u.s.a": "US", america: "US", "united states of america": "US",
  turkey: "TR", turkiye: "TR", korea: "KR",
};
export function countryFromText(text: string | null | undefined): string | null {
  const t = (text ?? "").trim().toLowerCase();
  if (!t) return null;
  if (ALIASES[t]) return ALIASES[t];
  if (t.length === 2 && isCountryCode(t.toUpperCase())) return t.toUpperCase();
  const hit = Object.entries(COUNTRIES).find(([, c]) => c.name.toLowerCase() === t);
  return hit ? hit[0] : null;
}

export function suggestedCurrency(code: string | null | undefined): string | null {
  return code && isCountryCode(code) ? COUNTRIES[code].currency ?? null : null;
}
