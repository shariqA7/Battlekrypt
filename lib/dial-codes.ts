// Dial codes for the countries in lib/geo-data.ts, so the signup form can offer a
// code picker instead of free text. Keyed by the same ISO-3166 alpha-2 code.
export const DIAL_CODES: Record<string, string> = {
  PK: "92", IN: "91", BD: "880", LK: "94", NP: "977",
  SA: "966", AE: "971", QA: "974", KW: "965", BH: "973", OM: "968", EG: "20", TR: "90",
  JO: "962", IQ: "964", MA: "212",
  MY: "60", ID: "62", PH: "63", TH: "66", VN: "84", SG: "65",
  CN: "86", JP: "81", KR: "82", TW: "886",
  GB: "44", DE: "49", FR: "33", ES: "34", IT: "39", NL: "31", PL: "48", SE: "46",
  US: "1", CA: "1", MX: "52", BR: "55", AR: "54",
  NG: "234", ZA: "27", KE: "254", AU: "61", NZ: "64",
};

export function dialCodeFor(country: string | null | undefined): string | null {
  return country ? DIAL_CODES[country] ?? null : null;
}

// "+" + dial code + national digits (no leading zero), e.g. +923001234567.
export function toE164(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0+/, "");
  return `+${dial}${digits}`;
}
