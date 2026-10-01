// Where a request came from. The IP comes from the proxy headers; country,
// region and city come from the hosting platform's geo headers (Vercel sets
// x-vercel-ip-*, Cloudflare sets cf-ipcountry). On a host that sets neither,
// they are simply null — the IP is still recorded.
export interface ClientGeo {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
}

export function getClientGeo(h: Headers): ClientGeo {
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || h.get("x-real-ip") || h.get("cf-connecting-ip") || null;

  const country = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").toUpperCase();
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };

  return {
    ip,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    region: decode(h.get("x-vercel-ip-country-region")),
    city: decode(h.get("x-vercel-ip-city")),
  };
}

const names = new Intl.DisplayNames(["en"], { type: "region" });
export function countryName(code: string | null | undefined): string {
  if (!code) return "Unknown";
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}
