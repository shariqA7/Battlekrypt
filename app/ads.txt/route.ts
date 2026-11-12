// /ads.txt: the file AdSense asks every site to publish, listing who may sell its ad space.
// Built from the publisher ID saved in Admin > Ads. Empty (404) until AdSense is set up.
import { getAdsenseSettings } from "@/lib/services/ads";
import { adsTxtLine } from "@/lib/ad-rules";

export const dynamic = "force-dynamic";

export async function GET() {
  const line = adsTxtLine((await getAdsenseSettings().catch(() => null))?.adsenseClientId);
  if (!line) return new Response("Not found", { status: 404 });
  return new Response(line, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
