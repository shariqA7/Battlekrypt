// Donations and the community fund: who may give (verified-only rules), admin approval and the
// payment ledger, campaigns, fund balance, allocations, and the verified check itself.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { recordFingerprint } from "../lib/services/proof-fingerprints";
import { getVerifiedStatus } from "../lib/verified";
import {
  createDonation, reviewDonation, createCampaign, updateCampaign, allocateFund, getFundSummary, getDonateOverview,
  updateDonationSettings, listPendingDonations, getFundSupportFor, listCampaignsAdmin, DONATIONS_PER_DAY,
} from "../lib/services/donations";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const PROOF = "https://example.com/proof.png";
const day = 86_400_000;

async function main() {
  const users = ["adm", "free", "paidPlayer", "expired", "org", "club", "customFree", "donor1", "donor2", "spam"];
  await prisma.user.createMany({ data: users.map((u) => ({ id: u, email: `${u}@x.com`, displayName: `Name ${u}`, isAdmin: u === "adm" })) });
  const plan = (userId: string, planCode: string, planExpiresAt: Date | null = null) => prisma.playerProfile.create({ data: { userId, planCode, planExpiresAt } });
  await plan("free", "player_free");
  await plan("paidPlayer", "player_plus", new Date(Date.now() + 30 * day));
  await plan("expired", "player_plus", new Date(Date.now() - day));
  await plan("customFree", "player_basic");
  await prisma.plan.update({ where: { code: "player_basic" }, data: { isPaid: false } }); // a free custom plan is not "verified"
  await plan("donor1", "player_free"); await plan("donor2", "player_free"); await plan("spam", "player_free");
  await prisma.organizerProfile.create({ data: { userId: "org", orgName: "Verified Org", planCode: "organizer_pro", planExpiresAt: null } });
  await prisma.clubProfile.create({ data: { userId: "club", clubName: "Paid Club", subscriptionPlanCode: "club_pro", planExpiresAt: new Date(Date.now() + day) } as never });

  // ---- "verified" = an active paid plan ----
  ok("free player is not verified", !(await getVerifiedStatus("free")).verified);
  ok("paid player is verified", (await getVerifiedStatus("paidPlayer")).via === "player");
  ok("an ended plan doesn't count", !(await getVerifiedStatus("expired")).verified);
  ok("a free custom plan doesn't count", !(await getVerifiedStatus("customFree")).verified);
  ok("organization on a paid plan (no end date) is verified", (await getVerifiedStatus("org")).via === "organizer");
  ok("club on a paid plan is verified", (await getVerifiedStatus("club")).via === "club");
  ok("unknown user is not verified", !(await getVerifiedStatus("nobody")).verified);

  // ---- giving to the general fund ----
  let seq = 0;
  const give = (userId: string, over: Record<string, unknown> = {}) => createDonation({ userId, amount: 500, currency: "PKR", proofUrl: PROOF, reference: `TXN-${String(++seq).padStart(6, "0")}`, ...over });
  ok("negative amount refused", code(await give("donor1", { amount: -5 })) === "validation_error");
  ok("zero refused", code(await give("donor1", { amount: 0 })) === "validation_error");
  ok("three decimals refused", code(await give("donor1", { amount: 5.123 })) === "validation_error");
  ok("unknown currency refused", code(await give("donor1", { currency: "XYZ" })) === "validation_error");
  ok("transaction ID is required", code(await give("donor1", { reference: "" })) === "validation_error" && code(await give("donor1", { reference: "123" })) === "validation_error" && code(await give("donor1", { reference: "000000" })) === "validation_error");
  ok("proof is required", code(await give("donor1", { proofUrl: "" })) === "validation_error");
  ok("proof must be https", code(await give("donor1", { proofUrl: "javascript:alert(1)" })) === "validation_error");
  ok("message length limited", code(await give("donor1", { message: "x".repeat(301) })) === "validation_error");
  const d1 = await give("donor1", { message: "For the cup", anonymous: false });
  ok("a donation waits as pending", "data" in d1 && (await prisma.donation.findUnique({ where: { id: (d1 as { data: { id: string } }).data.id } }))?.status === "pending");
  ok("pending money is not in the fund yet", Object.keys((await getFundSummary()).raised).length === 0);
  ok("pending list shows donor and verified flag", (await listPendingDonations())[0]?.donor === "Name donor1" && (await listPendingDonations())[0].verified === false);

  // ---- the same screenshot or transaction ID on two donations is flagged (never blocked) ----
  const dupA = (await give("donor2", { amount: 7, reference: "AB-12 34 56" })) as { data: { id: string } };
  const dupB = (await give("spam", { amount: 8, reference: "ab123456" })) as { data: { id: string } };
  const dupC = (await give("customFree", { amount: 9 })) as { data: { id: string } };
  ok("a reused transaction ID is not blocked", "data" in dupA && "data" in dupB && "data" in dupC);
  // The screenshot check runs in the background after the response; run its recording step here.
  await recordFingerprint({ kind: "donation", refId: dupA.data.id, userId: "donor2", sha256: null, reference: "AB123456" });
  await recordFingerprint({ kind: "donation", refId: dupB.data.id, userId: "spam", sha256: null, reference: "AB123456" });
  await recordFingerprint({ kind: "donation", refId: dupC.data.id, userId: "customFree", sha256: "file-1", reference: "UNIQUE0001" });
  const pendingNow = await listPendingDonations();
  const flagA = pendingNow.find((p) => p.id === dupA.data.id)?.duplicate;
  ok("same ID with different spacing and case is flagged on both, by reference", flagA?.count === 1 && flagA.by === "reference" && pendingNow.find((p) => p.id === dupB.data.id)?.duplicate?.sameUser === false);
  ok("a donation with unique details has no flag", pendingNow.find((p) => p.id === dupC.data.id)?.duplicate === null);
  ok("the typed transaction ID is shown to the reviewer", pendingNow.find((p) => p.id === dupA.data.id)?.reference === "AB-12 34 56");
  await prisma.donation.deleteMany({ where: { id: { in: [dupA.data.id, dupB.data.id, dupC.data.id] } } }); // keep the rest of the test's numbers simple

  // ---- approval writes the ledger, once ----
  const id1 = (d1 as { data: { id: string } }).data.id;
  ok("rejecting needs a reason", code(await reviewDonation({ adminId: "adm", donationId: id1, approve: false, note: " " })) === "validation_error");
  ok("approve", "data" in (await reviewDonation({ adminId: "adm", donationId: id1, approve: true })));
  ok("approving again is refused", code(await reviewDonation({ adminId: "adm", donationId: id1, approve: true })) === "not_pending");
  ok("approved money is in the fund", (await getFundSummary()).raised.PKR === 500);
  const ledger = await prisma.paymentRecord.findMany({ where: { reference: id1 } });
  ok("one ledger row, kind donation, for the donor", ledger.length === 1 && ledger[0].kind === "donation" && ledger[0].userId === "donor1" && Number(ledger[0].amount) === 500);
  ok("two admins at once book it only once", await (async () => {
    const d = (await give("donor2", { amount: 100 })) as { data: { id: string } };
    const [a, b] = await Promise.all([reviewDonation({ adminId: "adm", donationId: d.data.id, approve: true }), reviewDonation({ adminId: "adm", donationId: d.data.id, approve: true })]);
    return [a, b].filter((r) => "data" in r).length === 1 && (await prisma.paymentRecord.count({ where: { reference: d.data.id } })) === 1;
  })());
  const rej = (await give("donor2", { amount: 50 })) as { data: { id: string } };
  ok("reject with a reason", "data" in (await reviewDonation({ adminId: "adm", donationId: rej.data.id, approve: false, note: "Screenshot unreadable" })));
  ok("rejected money never joins the fund", (await getFundSummary()).raised.PKR === 600);
  ok("donor is notified", (await prisma.notification.count({ where: { userId: "donor1" } })) >= 1);

  // ---- verified-only (general fund default) ----
  await updateDonationSettings({ verifiedOnly: true });
  ok("verified-only fund refuses a free player", code(await give("free")) === "not_verified");
  ok("verified-only fund accepts a paid player", "data" in (await give("paidPlayer", { amount: 10 })));
  ok("verified-only fund accepts a paid organization", "data" in (await give("org", { amount: 10 })));
  ok("an ended plan is refused", code(await give("expired")) === "not_verified");
  await updateDonationSettings({ verifiedOnly: false });
  ok("open fund accepts a free player again", "data" in (await give("free", { amount: 10 })));

  // ---- campaigns ----
  ok("campaign needs a real description", code(await createCampaign({ adminId: "adm", title: "Cup", description: "short", currency: "PKR" })) === "validation_error");
  ok("campaign end date must be in the future", code(await createCampaign({ adminId: "adm", title: "Ramadan Cup", description: "Prize pool for the Ramadan cup", currency: "PKR", endsAt: "2020-01-01" })) === "validation_error");
  const c = await createCampaign({ adminId: "adm", title: "Ramadan Cup", description: "Prize pool for the Ramadan cup", currency: "PKR", goalAmount: 10000, verifiedOnly: true });
  const c2 = await createCampaign({ adminId: "adm", title: "Ramadan Cup", description: "A second drive with the same name", currency: "USD" });
  ok("campaigns get unique slugs", "data" in c && "data" in c2 && c.data.slug !== c2.data.slug);
  const cid = (c as { data: { id: string } }).data.id;
  const cid2 = (c2 as { data: { id: string } }).data.id;
  ok("a verified-only campaign refuses a free player", code(await give("free", { campaignId: cid })) === "not_verified");
  ok("campaign takes its own currency only", code(await give("paidPlayer", { campaignId: cid, currency: "USD" })) === "validation_error");
  const cd = await give("paidPlayer", { campaignId: cid, amount: 2000 });
  ok("a verified account can give to the campaign", "data" in cd);
  await reviewDonation({ adminId: "adm", donationId: (cd as { data: { id: string } }).data.id, approve: true });
  ok("open campaign (all users) accepts a free player", "data" in (await give("free", { campaignId: cid2, currency: "USD", amount: 5 })));
  const camp = (await listCampaignsAdmin()).find((x) => x.id === cid)!;
  ok("campaign shows raised and donors", camp.raised === 2000 && camp.donors === 1 && camp.goal === 10000);
  await updateCampaign({ adminId: "adm", id: cid2, status: "closed" });
  ok("a closed campaign refuses gifts", code(await give("free", { campaignId: cid2, currency: "USD" })) === "campaign_closed");
  ok("unknown campaign", code(await give("free", { campaignId: "nope" })) === "not_found");
  ok("a campaign can switch to verified-only", "data" in (await updateCampaign({ adminId: "adm", id: cid, verifiedOnly: false })) && "data" in (await give("free", { campaignId: cid })));

  // ---- using the fund ----
  const game = await prisma.game.create({ data: { name: "G" } });
  const org = await prisma.organizerProfile.findUnique({ where: { userId: "org" } });
  const t = await prisma.tournament.create({ data: { slug: "cup", organizerId: org!.id, gameId: game.id, name: "Ramadan Cup", type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "free" } });
  const bal = (await getFundSummary()).balance.PKR;
  ok("balance = approved - allocated", bal === 2600);
  ok("can't allocate more than the fund holds", code(await allocateFund({ adminId: "adm", amount: bal + 1, currency: "PKR", purpose: "Too much" })) === "over_balance");
  ok("can't allocate in a currency with no money", code(await allocateFund({ adminId: "adm", amount: 1, currency: "EUR", purpose: "No euros" })) === "over_balance");
  ok("can't spend more than the campaign raised", code(await allocateFund({ adminId: "adm", amount: 2500, currency: "PKR", purpose: "Over campaign", campaignId: cid })) === "over_balance");
  ok("purpose is required", code(await allocateFund({ adminId: "adm", amount: 10, currency: "PKR", purpose: "x" })) === "validation_error");
  ok("tournament must exist", code(await allocateFund({ adminId: "adm", amount: 10, currency: "PKR", purpose: "Prize pool", tournamentId: "nope" })) === "validation_error");
  ok("allocate to a tournament's prize pool", "data" in (await allocateFund({ adminId: "adm", amount: 1500, currency: "PKR", purpose: "Ramadan Cup prize pool", campaignId: cid, tournamentId: t.id })));
  ok("balance drops, campaign balance too", (await getFundSummary()).balance.PKR === 1100 && (await getFundSummary(cid)).balance.PKR === 500);
  ok("two allocations racing can't overspend", await (async () => {
    const r = await Promise.all([allocateFund({ adminId: "adm", amount: 1000, currency: "PKR", purpose: "Race one" }), allocateFund({ adminId: "adm", amount: 1000, currency: "PKR", purpose: "Race two" })]);
    return r.filter((x) => "data" in x).length <= 1 && (await getFundSummary()).balance.PKR >= 0;
  })());
  const support = await getFundSupportFor(org!.id);
  ok("organizer page: fund support for its events", support.totals.PKR === 1500 && support.items[0]?.tournament === "Ramadan Cup" && support.count === 1);

  // ---- the public page data ----
  const ov = await getDonateOverview("free");
  ok("overview: fund, open campaigns, viewer, allocations", ov.enabled && ov.fund.raised.PKR === 2600 && ov.campaigns.length === 1 && ov.viewer.loggedIn && !ov.viewer.verified && ov.allocations.length >= 1);
  ok("overview lists supporters by name, never anonymous ones", await (async () => {
    const a = (await give("customFree", { amount: 20, anonymous: true })) as { data: { id: string } };
    await reviewDonation({ adminId: "adm", donationId: a.data.id, approve: true });
    const o = await getDonateOverview(null);
    return o.supporters.some((s) => s.name === "Name donor1") && !o.supporters.some((s) => s.name === "Name customFree");
  })());
  ok("a logged-out visitor is not verified", !(await getDonateOverview(null)).viewer.loggedIn);

  // ---- limits and the switch ----
  let allowed = 0, last: unknown = null;
  for (let i = 0; i < DONATIONS_PER_DAY + 1; i++) { last = await give("spam", { amount: 5 }); if (!code(last)) allowed++; }
  ok(`${DONATIONS_PER_DAY} donations a day, then refused`, allowed === DONATIONS_PER_DAY && code(last) === "rate_limited");
  ok("instructions can be saved", (await updateDonationSettings({ instructions: "  JazzCash 0300-0000000  " })) && (await getDonateOverview(null)).instructions === "JazzCash 0300-0000000");
  ok("instructions length limited", code(await updateDonationSettings({ instructions: "x".repeat(2001) })) === "validation_error");
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, update: { donationsEnabled: false }, create: { id: "singleton", donationsEnabled: false } });
  ok("switched off: no new donations", code(await give("donor1")) === "feature_off");
  ok("switched off: the fund records stay", (await getFundSummary()).raised.PKR > 0);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
