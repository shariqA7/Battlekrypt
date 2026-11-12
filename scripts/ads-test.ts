// Ads: the rules (campaign validation, schedule, audience, weighted pick, AdSense and the EU block),
// which banner is picked for a placement and viewer, view/click counting, the admin functions, and
// the staff permission. Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import {
  isLive, matchesViewer, pickWeighted, validateCampaign, validateAdsense, adsenseAllowedIn, adsenseSlotFor, adsTxtLine,
} from "../lib/ad-rules";
import {
  pickAd, recordView, recordClick, createCampaign, updateCampaign, deleteCampaign,
  listCampaignsWithStats, getAdsenseSettings, updateAdsenseSettings,
} from "../lib/services/ads";
import { hasAccess, ROLE_TEMPLATES, STAFF_PERMISSION_KEYS } from "../lib/staff-permissions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const idOf = (r: unknown) => (r as { data: { id: string } }).data.id;

const good = { name: "Spring promo", advertiser: "GearCo", imageUrl: "https://cdn.example.com/a.png", linkUrl: "https://gearco.example/shop", altText: "GearCo gaming headsets", placements: ["browse", "dashboard"], audience: "all", weight: 1 };
const D = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);
const player = { player: true, organizer: false };
const organizer = { player: false, organizer: true };

async function main() {
  // ---- campaign validation ----
  ok("rules: a good campaign passes", validateCampaign(good).ok);
  ok("rules: name required", !validateCampaign({ ...good, name: "" }).ok);
  ok("rules: advertiser required", !validateCampaign({ ...good, advertiser: "x" }).ok);
  ok("rules: image must be https", !validateCampaign({ ...good, imageUrl: "http://cdn.example.com/a.png" }).ok && !validateCampaign({ ...good, imageUrl: "" }).ok);
  ok("rules: link must be https (no javascript: or http:)", !validateCampaign({ ...good, linkUrl: "javascript:alert(1)" }).ok && !validateCampaign({ ...good, linkUrl: "http://x.example" }).ok);
  ok("rules: link with spaces refused", !validateCampaign({ ...good, linkUrl: "https://a b" }).ok);
  ok("rules: alt text required", !validateCampaign({ ...good, altText: "" }).ok);
  ok("rules: at least one placement", !validateCampaign({ ...good, placements: [] }).ok && !validateCampaign({ ...good, placements: ["room_reveal"] }).ok);
  ok("rules: payment pages are not a placement", !validateCampaign({ ...good, placements: ["payment"] }).ok);
  ok("rules: unknown audience refused", !validateCampaign({ ...good, audience: "vip" }).ok);
  ok("rules: end before start refused", !validateCampaign({ ...good, startsAt: D(5).toISOString(), endsAt: D(2).toISOString() }).ok);
  ok("rules: bad date refused", !validateCampaign({ ...good, startsAt: "nonsense" }).ok);
  ok("rules: weight 0, 11 and 1.5 refused; 10 allowed", [0, 11, 1.5].every((w) => !validateCampaign({ ...good, weight: w }).ok) && validateCampaign({ ...good, weight: 10 }).ok);
  ok("rules: amount needs a supported currency", !validateCampaign({ ...good, paidAmount: 100 }).ok && !validateCampaign({ ...good, paidAmount: 100, paidCurrency: "XXX" }).ok && validateCampaign({ ...good, paidAmount: "250.505", paidCurrency: "PKR" }).ok);
  ok("rules: negative amount refused", !validateCampaign({ ...good, paidAmount: -1, paidCurrency: "PKR" }).ok);
  const dedup = validateCampaign({ ...good, placements: ["browse", "browse", "dashboard"] });
  ok("rules: duplicate placements are merged", dedup.ok && dedup.value.placements.length === 2);

  // ---- schedule, audience, weighted pick ----
  const now = new Date();
  ok("live: inside the window", isLive({ active: true, startsAt: D(-1), endsAt: D(1) }, now));
  ok("live: no end date", isLive({ active: true, startsAt: D(-1), endsAt: null }, now));
  ok("live: not started yet / ended / switched off", !isLive({ active: true, startsAt: D(1), endsAt: null }, now) && !isLive({ active: true, startsAt: D(-5), endsAt: D(-1) }, now) && !isLive({ active: false, startsAt: D(-1), endsAt: null }, now));
  ok("audience: everyone matches all", matchesViewer("all", player) && matchesViewer("all", organizer));
  ok("audience: player and organizer campaigns", matchesViewer("player", player) && !matchesViewer("player", organizer) && matchesViewer("organizer", organizer) && !matchesViewer("organizer", player));
  ok("audience: someone with both profiles matches both", matchesViewer("player", { player: true, organizer: true }) && matchesViewer("organizer", { player: true, organizer: true }));
  ok("pick: nothing to pick from", pickWeighted([]) === null);
  const a = { id: "a", weight: 1 }, b = { id: "b", weight: 3 };
  ok("pick: weight 3 gets three quarters of the range", pickWeighted([a, b], () => 0)?.id === "a" && pickWeighted([a, b], () => 0.24)?.id === "a" && pickWeighted([a, b], () => 0.25)?.id === "b" && pickWeighted([a, b], () => 0.999)?.id === "b");
  let bCount = 0; for (let i = 0; i < 4000; i++) if (pickWeighted([a, b])?.id === "b") bCount++;
  ok("pick: over many tries weight 3 is shown about 3x as often", bCount > 2800 && bCount < 3200);

  // ---- AdSense and the EU block ----
  ok("adsense: allowed in Pakistan, India, UAE, US", ["PK", "IN", "AE", "US", "sa"].every((c) => adsenseAllowedIn(c)));
  ok("adsense: blocked in the EU, UK and Switzerland", ["DE", "FR", "GB", "CH", "NO", "ie"].every((c) => !adsenseAllowedIn(c)));
  ok("adsense: unknown country is treated as blocked", !adsenseAllowedIn(null) && !adsenseAllowedIn(undefined) && !adsenseAllowedIn(""));
  ok("adsense: once a consent message is live, Europe and unknown countries are allowed", ["DE", "GB", "CH", "FR"].every((c) => adsenseAllowedIn(c, true)) && adsenseAllowedIn(null, true) && adsenseAllowedIn("PK", true));
  ok("ads.txt: the line AdSense asks for", adsTxtLine("ca-pub-1234567890123456") === "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  ok("ads.txt: nothing without a valid publisher id", adsTxtLine(null) === null && adsTxtLine("") === null && adsTxtLine("ca-pub-12") === null && adsTxtLine("x\ngoogle.com, evil") === null);
  ok("adsense: consent flag must be true or false", !validateAdsense({ adsenseEuConsentReady: "yes" }).ok && validateAdsense({ adsenseEuConsentReady: true }).ok);
  ok("adsense: a good publisher id and slot pass", validateAdsense({ adsenseClientId: "ca-pub-1234567890123456", adsenseSlotBrowse: "1234567890" }).ok);
  ok("adsense: bad ids refused", !validateAdsense({ adsenseClientId: "<script>" }).ok && !validateAdsense({ adsenseSlotBrowse: "abc" }).ok && !validateAdsense({ adsenseClientId: "pub-123" }).ok);
  const cleared = validateAdsense({ adsenseClientId: "" });
  ok("adsense: an empty value clears the field", cleared.ok && cleared.value.adsenseClientId === null);
  ok("adsense: slot for each placement", adsenseSlotFor({ adsenseClientId: "x", adsenseSlotBrowse: "1", adsenseSlotTournament: "2", adsenseSlotDashboard: "3" }, "tournament_detail") === "2");

  // ---- permission ----
  ok("permission: ads is a staff permission, admins can edit it", STAFF_PERMISSION_KEYS.includes("ads" as never) && ROLE_TEMPLATES.admin.ads === "edit");
  ok("permission: staff without it can't open Ads", !hasAccess({ userId: "s", role: "manager" as const, grants: { users: "view" as const } }, "ads"));

  // ---- the service ----
  await prisma.user.create({ data: { id: "adm", email: "adm@x.com", displayName: "Admin", isAdmin: true } });
  ok("create: bad input refused, nothing saved", code(await createCampaign("adm", { ...good, linkUrl: "nope" })) === "validation_error" && (await prisma.adCampaign.count()) === 0);
  const browse = idOf(await createCampaign("adm", { ...good, name: "Browse only", placements: ["browse"] }));
  const dash = idOf(await createCampaign("adm", { ...good, name: "Dashboard only", placements: ["dashboard"] }));
  const orgOnly = idOf(await createCampaign("adm", { ...good, name: "Organizer gear", placements: ["browse"], audience: "organizer", weight: 10 }));
  const future = idOf(await createCampaign("adm", { ...good, name: "Next month", placements: ["tournament_detail"], startsAt: D(30).toISOString() }));
  const ended = idOf(await createCampaign("adm", { ...good, name: "Old", placements: ["tournament_detail"], startsAt: D(-20).toISOString(), endsAt: D(-10).toISOString() }));
  const off = idOf(await createCampaign("adm", { ...good, name: "Paused", placements: ["tournament_detail"], active: false }));

  const ids = async (placement: Parameters<typeof pickAd>[0], v: typeof player, r = () => 0) => (await pickAd(placement, v, new Date(), r))?.id ?? null;
  ok("pick ad: a player on browse gets the browse banner, not the organizer one", (await ids("browse", player)) === browse);
  ok("pick ad: an organizer on browse can get the organizer banner (weight 10)", (await ids("browse", organizer, () => 0.99)) === orgOnly);
  ok("pick ad: dashboard placement", (await ids("dashboard", player)) === dash);
  ok("pick ad: scheduled, ended and switched-off banners are never shown", (await ids("tournament_detail", player)) === null);
  ok("pick ad: nothing fits -> null", (await ids("tournament_detail", organizer)) === null);
  void future; void ended; void off;

  // ---- counting ----
  ok("view: counted for a live banner", (await recordView(browse)) === true);
  await recordView(browse); await recordView(browse);
  ok("view: not counted for an unknown, scheduled, ended or switched-off banner", !(await recordView("nope")) && !(await recordView(future)) && !(await recordView(ended)) && !(await recordView(off)));
  const url = await recordClick(browse);
  ok("click: returns the advertiser's link", url === good.linkUrl);
  ok("click: a banner that ended still redirects but is not counted", (await recordClick(ended)) === good.linkUrl && (await prisma.adDailyStat.count({ where: { campaignId: ended } })) === 0);
  ok("click: not counted when asked not to (rate limited)", (await recordClick(browse, new Date(), false)) === good.linkUrl);
  ok("click: unknown banner -> null", (await recordClick("nope")) === null);
  const stat = await prisma.adDailyStat.findMany({ where: { campaignId: browse } });
  ok("counts: one row per day with the right totals", stat.length === 1 && stat[0].impressions === 3 && stat[0].clicks === 1);
  await Promise.all(Array.from({ length: 8 }, () => recordView(dash)));
  ok("counts: simultaneous first views of a day are not lost", (await prisma.adDailyStat.findMany({ where: { campaignId: dash } })).reduce((n, r) => n + r.impressions, 0) === 8);
  const list = await listCampaignsWithStats();
  const row = list.find((c) => c.id === browse);
  ok("list: totals and last-30-day numbers", row?.impressions === 3 && row.clicks === 1 && row.impressions30 === 3 && row.live === true);
  ok("list: live flag", list.find((c) => c.id === future)?.live === false && list.find((c) => c.id === off)?.live === false);

  // ---- admin changes ----
  ok("update: switch off with just { active }", !code(await updateCampaign(browse, { active: false })) && (await ids("browse", player)) !== browse);
  ok("update: a full edit is validated", code(await updateCampaign(browse, { ...good, altText: "" })) === "validation_error");
  ok("update: a full edit saves", !code(await updateCampaign(browse, { ...good, name: "Renamed", placements: ["browse"], active: true })) && (await prisma.adCampaign.findUnique({ where: { id: browse } }))?.name === "Renamed");
  ok("update: unknown id", code(await updateCampaign("nope", { active: true })) === "not_found");
  ok("delete: removes the banner and its counts", !code(await deleteCampaign(browse)) && (await prisma.adDailyStat.count({ where: { campaignId: browse } })) === 0);
  ok("delete: unknown id", code(await deleteCampaign(browse)) === "not_found");

  // ---- AdSense settings ----
  ok("adsense settings: default is empty and ads are off", (await getAdsenseSettings()).adsenseClientId === null);
  ok("adsense settings: saves valid ids", !code(await updateAdsenseSettings({ adsenseClientId: "ca-pub-1234567890123456", adsenseSlotBrowse: "1234567890" })) && (await getAdsenseSettings()).adsenseSlotBrowse === "1234567890");
  ok("adsense settings: bad id refused and nothing changes", code(await updateAdsenseSettings({ adsenseClientId: "x" })) === "validation_error" && (await getAdsenseSettings()).adsenseClientId === "ca-pub-1234567890123456");
  ok("adsense settings: empty value clears", !code(await updateAdsenseSettings({ adsenseClientId: "" })) && (await getAdsenseSettings()).adsenseClientId === null);
  ok("adsense settings: consent flag is off by default and can be switched on", (await getAdsenseSettings()).adsenseEuConsentReady === false && !code(await updateAdsenseSettings({ adsenseEuConsentReady: true })) && (await getAdsenseSettings()).adsenseEuConsentReady === true);
  ok("adsense settings: nothing to update refused", code(await updateAdsenseSettings({})) === "validation_error");

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
