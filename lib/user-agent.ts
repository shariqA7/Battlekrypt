// Small user-agent reader for analytics — enough to tell desktop/mobile/tablet,
// the OS and the browser. Returns null for crawlers so they aren't counted.
export interface ParsedUA {
  deviceType: "desktop" | "mobile" | "tablet" | "unknown";
  os: string;
  browser: string;
}

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|headless|lighthouse|curl|wget/i;

export function parseUserAgent(ua: string | null | undefined): ParsedUA | null {
  if (!ua) return { deviceType: "unknown", os: "Unknown", browser: "Unknown" };
  if (BOT.test(ua)) return null;

  const tablet = /iPad|Tablet|Nexus 7|Nexus 9|SM-T|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const mobile = !tablet && /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua);

  let os = "Other";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Other";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  return { deviceType: tablet ? "tablet" : mobile ? "mobile" : "desktop", os, browser };
}
