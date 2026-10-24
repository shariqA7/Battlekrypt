import { COUNTRIES } from "@/lib/geo-data";

// The countries offered in pickers, A to Z, as { code, name }.
export const COUNTRY_LIST = Object.entries(COUNTRIES)
  .map(([code, c]) => ({ code, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name));
