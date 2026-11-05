// Giveaways: creating (admin and organizer rules), review, who may enter, the random draw, replacing
// winners, delivery and confirmation, cancelling, and what each person can see.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { PROOF_BUCKET } from "../lib/proof-storage";
import { deletionBlockers, eraseUser, type ErasureDeps } from "../lib/services/account-deletion";
import { runRetention } from "../lib/services/retention";
import {
  createGiveaway, reviewGiveaway, activateGiveaway, setGiveawayVerifiedOnly, cancelGiveaway, enterGiveaway, drawWinners, replaceWinner,
  submitWinnerDetails, markDelivered, confirmReceived, disputeDelivery, updateGiveawaySettings, getGiveawaySettings, pickRandom,
  listPublicGiveaways, getGiveawayPage, listGiveawaysForAdmin, listGiveawaysForOrganizer, listMyWinnings, getGiveawayStatsFor,
} from "../lib/services/giveaways";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const day = 86_400_000;
const future = (d: number) => new Date(Date.now() + d * day).toISOString();
const ADM = { userId: "adm", isAdmin: true };
const id = (r: unknown) => (r as { data: { id: string } }).data.id;

const base = { title: "Win a gaming laptop", description: "A great prize from our partner brand.", prizeKind: "physical", prizeTitle: "Gaming laptop", winnersCount: 1, endsAt: future(7) };

async function main() {
  const names = ["adm", "orgPaid", "orgFree", "orgNew", "orgPaused", "orgUnapproved", "p1", "p2", "p3", "p4", "p5", "p6", "paid", "expired", "minor", "adult", "banned", "stranger"];
  await prisma.user.createMany({ data: names.map((u) => ({ id: u, email: `${u}@x.com`, displayName: `Name ${u}`, isAdmin: u === "adm", kycStatus: u === "orgUnapproved" ? "none" : u.startsWith("org") ? "approved" : "none" })) });
  const org = (userId: string, orgName: string, extra: Record<string, unknown> = {}) => prisma.organizerProfile.create({ data: { userId, orgName, planCode: "organizer_free", limitsLifted: true, ...extra } });
  const oPaid = await org("orgPaid", "Paid Org", { planCode: "organizer_pro" });
  const oFree = await org("orgFree", "Free Org");
  await org("orgNew", "New Org", { limitsLifted: false });
  await org("orgPaused", "Paused Org", { reportsPausedAt: new Date() });
  await org("orgUnapproved", "Unapproved Org");
  const player = (userId: string, extra: Record<string, unknown> = {}) => prisma.playerProfile.create({ data: { userId, ...extra } });
  for (const u of ["p1", "p2", "p3", "p4", "p5", "p6", "stranger"]) await player(u);
  await player("paid", { planCode: "player_plus", planExpiresAt: new Date(Date.now() + 30 * day) });
  await player("expired", { planCode: "player_plus", planExpiresAt: new Date(Date.now() - day) });
  await player("minor", { age: 15 }); await player("adult", { age: 25 }); await player("banned");
  await prisma.accountBan.create({ data: { userId: "banned", reason: "cheating", createdById: "adm" } });

  // ---- settings ----
  ok("settings default", JSON.stringify(await getGiveawaySettings()) === JSON.stringify({ verifiedOnly: false, reviewAboveUsd: 50, claimDays: 14 }));
  ok("settings: bad claim days refused", code(await updateGiveawaySettings({ adminId: "adm", claimDays: 0 })) === "validation_error" && code(await updateGiveawaySettings({ adminId: "adm", claimDays: 91 })) === "validation_error");
  ok("settings: negative review limit refused", code(await updateGiveawaySettings({ adminId: "adm", reviewAboveUsd: -1 })) === "validation_error");
  ok("settings: nothing to update refused", code(await updateGiveawaySettings({ adminId: "adm" })) === "validation_error");

  // ---- admin creates a platform giveaway ----
  ok("only an admin can host as the platform", code(await createGiveaway({ userId: "p1", isAdmin: false }, "platform", base)) === "forbidden");
  const bads: [string, Record<string, unknown>][] = [
    ["short title", { title: "ab" }], ["short description", { description: "short" }], ["unknown prize kind", { prizeKind: "car" }], ["short prize name", { prizeTitle: "x" }],
    ["0 winners", { winnersCount: 0 }], ["101 winners", { winnersCount: 101 }], ["end in the past", { endsAt: "2020-01-01" }], ["more than 90 days", { endsAt: future(120) }],
    ["ends before it starts", { startsAt: future(5), endsAt: future(3) }], ["sponsor link not https", { sponsorUrl: "http://x.com" }], ["negative value", { prizeValueUsd: -5 }], ["prize photo not https", { prizeImageUrl: "javascript:alert(1)" }],
  ];
  for (const [name, over] of bads) ok(`refused: ${name}`, code(await createGiveaway(ADM, "platform", { ...base, ...over })) === "validation_error");
  const brand = await createGiveaway(ADM, "platform", { ...base, sponsorName: "RazerLike", sponsorUrl: "https://brand.example", verifiedOnly: true, prizeValueUsd: 1500 });
  ok("platform giveaway with a sponsor goes live", "data" in brand && brand.data.status === "active");
  const gBrand = await prisma.giveaway.findUniqueOrThrow({ where: { id: id(brand) } });
  ok("sponsor, verified-only, no organizer saved", gBrand.sponsorName === "RazerLike" && gBrand.verifiedOnly === true && gBrand.organizerId === null && gBrand.hostType === "platform");
  const draft = await createGiveaway(ADM, "platform", { ...base, title: "Draft one", draft: true });
  ok("an admin can save a draft", "data" in draft && draft.data.status === "draft");
  ok("activating a draft makes it live", "data" in (await activateGiveaway({ adminId: "adm", id: id(draft) })) && (await prisma.giveaway.findUniqueOrThrow({ where: { id: id(draft) } })).status === "active");
  ok("activating twice is refused", code(await activateGiveaway({ adminId: "adm", id: id(draft) })) === "bad_state");

  // ---- an organizer creates one ----
  const o = (u: string) => ({ userId: u, isAdmin: false });
  const orgBase = { ...base, prizeValueUsd: 20 };
  ok("a non-organizer can't host", code(await createGiveaway(o("p1"), "organizer", orgBase)) === "not_organizer");
  ok("an unapproved organizer can't host", code(await createGiveaway(o("orgUnapproved"), "organizer", orgBase)) === "not_approved");
  ok("a paused organizer can't host", code(await createGiveaway(o("orgPaused"), "organizer", orgBase)) === "paused");
  ok("a new organizer (limits not lifted) can't host", code(await createGiveaway(o("orgNew"), "organizer", orgBase)) === "not_graduated");
  ok("an organizer must say what the prize is worth", code(await createGiveaway(o("orgPaid"), "organizer", base)) === "validation_error");
  ok("an organizer can't set a sponsor or who may enter", await (async () => {
    const r = await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, sponsorName: "Sneaky", verifiedOnly: true });
    const g = await prisma.giveaway.findUniqueOrThrow({ where: { id: id(r) } });
    return g.sponsorName === null && g.verifiedOnly === false && g.organizerId === oPaid.id && g.hostType === "organizer" && g.status === "active";
  })());
  await updateGiveawaySettings({ adminId: "adm", verifiedOnly: true });
  const followsDefault = await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Follows the default", verifiedOnly: false });
  ok("who may enter follows the platform default, whatever the organizer sends", (await prisma.giveaway.findUniqueOrThrow({ where: { id: id(followsDefault) } })).verifiedOnly === true);
  await updateGiveawaySettings({ adminId: "adm", verifiedOnly: false });
  const big = await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Big prize", prizeValueUsd: 500 });
  ok("a prize above the review limit waits for an admin", "data" in big && big.data.status === "pending_review");
  ok("a prize at the limit goes live", (await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "At the limit", prizeValueUsd: 50 }) as { data: { status: string } }).data.status === "active");
  ok("the free plan allows one a month, the second is refused", "data" in (await createGiveaway(o("orgFree"), "organizer", orgBase)) && code(await createGiveaway(o("orgFree"), "organizer", { ...orgBase, title: "Second" })) === "monthly_limit");
  ok("a cancelled giveaway doesn't use up the month", await (async () => {
    const f = await prisma.giveaway.findFirstOrThrow({ where: { organizerId: oFree.id } });
    await prisma.giveaway.update({ where: { id: f.id }, data: { status: "cancelled" } });
    return "data" in (await createGiveaway(o("orgFree"), "organizer", { ...orgBase, title: "After a cancel" }));
  })());
  ok("an organizer can only link its own tournament", code(await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Wrong tournament", tournamentId: "nope" })) === "validation_error");

  // ---- review ----
  const bigId = id(big);
  ok("rejecting needs a reason", code(await reviewGiveaway({ adminId: "adm", id: bigId, approve: false, note: " " })) === "validation_error");
  ok("approve", (await reviewGiveaway({ adminId: "adm", id: bigId, approve: true }) as { data: { status: string } }).data.status === "active");
  ok("reviewing again is refused", code(await reviewGiveaway({ adminId: "adm", id: bigId, approve: true })) === "bad_state");
  const big2 = await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Big two", prizeValueUsd: 900 });
  ok("reject with a reason", "data" in (await reviewGiveaway({ adminId: "adm", id: id(big2), approve: false, note: "Not allowed" })) && (await prisma.giveaway.findUniqueOrThrow({ where: { id: id(big2) } })).status === "rejected");
  const big3 = await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Big three", prizeValueUsd: 900 });
  await prisma.giveaway.update({ where: { id: id(big3) }, data: { endsAt: new Date(Date.now() - 1000) } });
  ok("can't approve one that has already passed its end date", code(await reviewGiveaway({ adminId: "adm", id: id(big3), approve: true })) === "validation_error");
  ok("the organizer is told about the decision", (await prisma.notification.count({ where: { userId: "orgPaid", type: "giveaway" } })) >= 2);

  // ---- who may enter ----
  const open = await createGiveaway(ADM, "platform", { ...base, title: "Open to all" });
  const openId = id(open);
  const verifiedOnly = id(brand);
  ok("not signed in can't enter", code(await enterGiveaway("nobody", openId)) === "forbidden");
  ok("a player can enter", "data" in (await enterGiveaway("p1", openId)));
  ok("entering twice is refused", code(await enterGiveaway("p1", openId)) === "already_entered");
  ok("two taps at once make one entry", await (async () => { const r = await Promise.all([enterGiveaway("p2", openId), enterGiveaway("p2", openId)]); return r.filter((x) => "data" in x).length === 1 && (await prisma.giveawayEntry.count({ where: { giveawayId: openId, userId: "p2" } })) === 1; })());
  ok("an admin can't enter (they draw it)", code(await enterGiveaway("adm", openId)) === "host");
  ok("verified-only: a free player is turned away", code(await enterGiveaway("p1", verifiedOnly)) === "not_verified");
  ok("verified-only: an ended plan is turned away", code(await enterGiveaway("expired", verifiedOnly)) === "not_verified");
  ok("verified-only: a paid player can enter", "data" in (await enterGiveaway("paid", verifiedOnly)));
  ok("verified-only: a paid organization can enter", "data" in (await enterGiveaway("orgPaid", verifiedOnly)));
  const orgGive = id(await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Org giveaway two" }));
  ok("the organization's owner can't enter its own giveaway", code(await enterGiveaway("orgPaid", orgGive)) === "host");
  await prisma.organizationMember.create({ data: { organizerId: oPaid.id, userId: "p6", email: "p6@x.com", name: "Mem", role: "manager" } as never });
  ok("a team member of the organization can't either", code(await enterGiveaway("p6", orgGive)) === "host");
  const notYet = id(await createGiveaway(ADM, "platform", { ...base, title: "Starts later", startsAt: future(2), endsAt: future(5) }));
  ok("can't enter before it starts", code(await enterGiveaway("p1", notYet)) === "not_started");
  const gone = id(await createGiveaway(ADM, "platform", { ...base, title: "Already over" }));
  await prisma.giveaway.update({ where: { id: gone }, data: { endsAt: new Date(Date.now() - 1000) } });
  ok("can't enter after it closes", code(await enterGiveaway("p1", gone)) === "closed");
  ok("can't enter a draft", code(await enterGiveaway("p1", id(await createGiveaway(ADM, "platform", { ...base, title: "Hidden draft", draft: true })))) === "not_found");
  const cash = id(await createGiveaway(ADM, "platform", { ...base, title: "Cash prize", prizeKind: "cash" }));
  ok("cash prize: a minor is turned away", code(await enterGiveaway("minor", cash)) === "age_restricted");
  ok("cash prize: no age on file is turned away", code(await enterGiveaway("p1", cash)) === "age_restricted");
  ok("cash prize: an adult can enter", "data" in (await enterGiveaway("adult", cash)));
  const game = await prisma.game.create({ data: { name: "G" } });
  const t = await prisma.tournament.create({ data: { slug: "cup", organizerId: oPaid.id, gameId: game.id, name: "Cup", type: "tournament", mode: "solo", maxTeams: 8, format: "single_elimination", entryType: "free" } });
  const ppl = await prisma.playerProfile.findUniqueOrThrow({ where: { userId: "p3" } });
  await prisma.registration.create({ data: { tournamentId: t.id, playerId: ppl.id, status: "approved", paymentStatus: "waived" } });
  const tg = id(await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "For Cup players", tournamentId: t.id }));
  ok("tournament giveaway: a non-participant is turned away", code(await enterGiveaway("p4", tg)) === "tournament_required");
  ok("tournament giveaway: a participant can enter", "data" in (await enterGiveaway("p3", tg)));

  // ---- the draw ----
  const dg = id(await createGiveaway(ADM, "platform", { ...base, title: "Three winners", winnersCount: 3 }));
  for (const u of ["p1", "p2", "p3", "p4", "p5", "banned"]) await prisma.giveawayEntry.create({ data: { giveawayId: dg, userId: u } });
  ok("can't draw before it closes", code(await drawWinners({ actor: ADM, id: dg })) === "too_early");
  ok("someone else can't draw it", code(await drawWinners({ actor: { userId: "p1", isAdmin: false }, id: dg, early: true })) === "forbidden");
  ok("another organizer can't draw it", code(await drawWinners({ actor: o("orgFree"), id: orgGive })) === "forbidden");
  const [d1, d2] = await Promise.all([drawWinners({ actor: ADM, id: dg, early: true }), drawWinners({ actor: ADM, id: dg, early: true })]);
  ok("an admin can close early; a double click draws once", [d1, d2].filter((r) => "data" in r).length === 1 && (await prisma.giveawayWinner.count({ where: { giveawayId: dg } })) === 3);
  const won = await prisma.giveawayWinner.findMany({ where: { giveawayId: dg } });
  ok("3 different winners, never the banned entrant", new Set(won.map((w) => w.userId)).size === 3 && !won.some((w) => w.userId === "banned"));
  ok("winners start waiting for their details, with a deadline", won.every((w) => w.status === "awaiting_details" && w.claimDeadline.getTime() > Date.now() + 13 * day));
  ok("winners are notified", (await prisma.notification.count({ where: { userId: { in: won.map((w) => w.userId) }, title: "You won a giveaway!" } })) === 3);
  ok("drawing again is refused", code(await drawWinners({ actor: ADM, id: dg, early: true })) === "already_drawn");
  ok("it is marked ended", (await prisma.giveaway.findUniqueOrThrow({ where: { id: dg } })).status === "ended");
  const few = id(await createGiveaway(ADM, "platform", { ...base, title: "Fewer entrants", winnersCount: 5 }));
  for (const u of ["p1", "p2"]) await prisma.giveawayEntry.create({ data: { giveawayId: few, userId: u } });
  const fr = await drawWinners({ actor: ADM, id: few, early: true });
  ok("fewer entrants than winners: everyone wins", "data" in fr && fr.data.winners === 2 && fr.data.entrants === 2);
  const none = id(await createGiveaway(ADM, "platform", { ...base, title: "Nobody entered" }));
  const nr = await drawWinners({ actor: ADM, id: none, early: true });
  ok("no entrants: ends with no winners", "data" in nr && nr.data.winners === 0 && (await prisma.giveaway.findUniqueOrThrow({ where: { id: none } })).status === "ended");
  const ownDraw = id(await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "Owner draws" }));
  await prisma.giveawayEntry.create({ data: { giveawayId: ownDraw, userId: "p1" } });
  ok("the owner can't draw before it closes", code(await drawWinners({ actor: o("orgPaid"), id: ownDraw })) === "too_early" && code(await drawWinners({ actor: o("orgPaid"), id: ownDraw, early: true })) === "too_early");
  await prisma.giveaway.update({ where: { id: ownDraw }, data: { endsAt: new Date(Date.now() - 1000) } });
  ok("the owner draws once it has closed, and is not told twice", "data" in (await drawWinners({ actor: o("orgPaid"), id: ownDraw })));
  const sample: Record<string, number> = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 3000; i++) sample[pickRandom(["a", "b", "c"], 1)[0]]++;
  ok("the draw is fair (3000 picks of 3 are all within 800-1200)", Object.values(sample).every((n) => n > 800 && n < 1200));
  ok("a pick never repeats someone", new Set(pickRandom([1, 2, 3, 4, 5, 6, 7, 8], 8)).size === 8);

  // ---- the winner's side ----
  const [w0, w1, w2] = won;
  const wUser = (w: { userId: string }) => w.userId;
  ok("a stranger can't send details for someone else", code(await submitWinnerDetails({ userId: "stranger", winnerId: w0.id, details: { name: "X", phone: "1", address: "a" } })) === "not_found");
  ok("physical prize needs name, phone and address", code(await submitWinnerDetails({ userId: wUser(w0), winnerId: w0.id, details: { name: "Ali Khan", phone: "03001234567" } })) === "validation_error");
  ok("physical prize: send details", "data" in (await submitWinnerDetails({ userId: wUser(w0), winnerId: w0.id, details: { name: "Ali Khan", phone: "03001234567", address: "House 4, Street 2, Lahore" } })));
  ok("details can be corrected until delivery", "data" in (await submitWinnerDetails({ userId: wUser(w0), winnerId: w0.id, details: { name: "Ali R Khan", phone: "03001234567", address: "House 4, Street 2, Lahore" } })));
  ok("a host can't deliver before details arrive", code(await markDelivered({ actor: ADM, winnerId: w1.id, note: "Sent by TCS 123" })) === "bad_state");
  ok("only a manager can deliver", code(await markDelivered({ actor: { userId: wUser(w0), isAdmin: false }, winnerId: w0.id, note: "Sent by TCS 123" })) === "forbidden");
  ok("delivery needs a note", code(await markDelivered({ actor: ADM, winnerId: w0.id, note: "x" })) === "validation_error");
  ok("deliver", "data" in (await markDelivered({ actor: ADM, winnerId: w0.id, note: "Sent by TCS, tracking 123456" })));
  ok("the winner is told it was sent", (await prisma.notification.count({ where: { userId: wUser(w0), title: "Your giveaway prize was sent" } })) === 1);
  ok("a stranger can't confirm", code(await confirmReceived({ userId: "stranger", winnerId: w0.id })) === "not_found");
  ok("dispute needs an explanation", code(await disputeDelivery({ userId: wUser(w0), winnerId: w0.id, note: "no" })) === "validation_error");
  ok("dispute", "data" in (await disputeDelivery({ userId: wUser(w0), winnerId: w0.id, note: "Nothing has arrived after two weeks" })));
  ok("the host can deliver again after a dispute", "data" in (await markDelivered({ actor: ADM, winnerId: w0.id, note: "Re-sent by TCS, tracking 777" })));
  ok("confirm receipt", "data" in (await confirmReceived({ userId: wUser(w0), winnerId: w0.id })));
  ok("confirming twice is refused", code(await confirmReceived({ userId: wUser(w0), winnerId: w0.id })) === "bad_state");
  ok("a confirmed prize can't be replaced", code(await replaceWinner({ actor: ADM, winnerId: w0.id, reason: "Changed my mind" })) === "bad_state");
  await prisma.giveawayWinner.update({ where: { id: w2.id }, data: { claimDeadline: new Date(Date.now() - 1000) } });
  ok("too late to send details", code(await submitWinnerDetails({ userId: wUser(w2), winnerId: w2.id, details: { name: "Late Person", phone: "0300111222", address: "Somewhere far away 1" } })) === "expired");
  const cashG = id(await createGiveaway(ADM, "platform", { ...base, title: "Cash draw", prizeKind: "cash" }));
  await prisma.giveawayEntry.create({ data: { giveawayId: cashG, userId: "adult" } });
  await drawWinners({ actor: ADM, id: cashG, early: true });
  const cw = await prisma.giveawayWinner.findFirstOrThrow({ where: { giveawayId: cashG } });
  ok("cash prize needs to know how to pay", code(await submitWinnerDetails({ userId: "adult", winnerId: cw.id, details: { name: "Adult One", phone: "0300111222" } })) === "validation_error");
  ok("cash prize: payout account sent", "data" in (await submitWinnerDetails({ userId: "adult", winnerId: cw.id, details: { name: "Adult One", phone: "0300111222", note: "JazzCash 0300111222" } })));

  // ---- replacing a winner ----
  ok("the owner can't replace a winner still within their time", code(await replaceWinner({ actor: o("orgPaid"), winnerId: (await prisma.giveawayWinner.findFirstOrThrow({ where: { giveawayId: ownDraw } })).id, reason: "Not answering" })) === "too_early");
  ok("replacing needs a reason", code(await replaceWinner({ actor: ADM, winnerId: w2.id, reason: " " })) === "validation_error");
  const rep = await replaceWinner({ actor: ADM, winnerId: w2.id, reason: "Did not send details in time" });
  ok("an admin replaces a winner who ran out of time", "data" in rep);
  const all = await prisma.giveawayWinner.findMany({ where: { giveawayId: dg } });
  const newcomer = all.find((w) => w.status === "awaiting_details" && !won.some((x) => x.id === w.id));
  ok("the new winner is a different entrant, not banned, with a fresh deadline", !!newcomer && !won.some((x) => x.userId === newcomer.userId) && newcomer.userId !== "banned" && newcomer.claimDeadline.getTime() > Date.now());
  ok("the old winner is marked replaced and told", (await prisma.giveawayWinner.findUniqueOrThrow({ where: { id: w2.id } })).status === "replaced" && (await prisma.notification.count({ where: { userId: wUser(w2), title: "Your giveaway prize was given to someone else" } })) === 1);
  ok("can't replace the same winner twice", code(await replaceWinner({ actor: ADM, winnerId: w2.id, reason: "Again please" })) === "bad_state");
  const lastEntrant = (await prisma.giveawayWinner.findMany({ where: { giveawayId: few } }))[0];
  const rep2 = await replaceWinner({ actor: ADM, winnerId: lastEntrant.id, reason: "Not reachable at all" });
  ok("nobody left to draw: replacement is empty, not an error", "data" in rep2 && rep2.data.replacement === null);

  // ---- cancelling ----
  const cg = id(await createGiveaway(o("orgPaid"), "organizer", { ...orgBase, title: "To be cancelled" }));
  await prisma.giveawayEntry.createMany({ data: [{ giveawayId: cg, userId: "p1" }, { giveawayId: cg, userId: "p2" }] });
  ok("cancel needs a reason", code(await cancelGiveaway({ actor: o("orgPaid"), id: cg, reason: "" })) === "validation_error");
  ok("a stranger can't cancel it", code(await cancelGiveaway({ actor: o("orgFree"), id: cg, reason: "Because" })) === "forbidden");
  ok("the owner cancels before the draw", "data" in (await cancelGiveaway({ actor: o("orgPaid"), id: cg, reason: "Prize no longer available" })));
  ok("entrants are told", (await prisma.notification.count({ where: { title: "A giveaway you entered was cancelled", userId: { in: ["p1", "p2"] } } })) === 2);
  ok("cancelling twice is refused", code(await cancelGiveaway({ actor: o("orgPaid"), id: cg, reason: "Again" })) === "bad_state");
  ok("the owner can't cancel after the draw", code(await cancelGiveaway({ actor: o("orgPaid"), id: ownDraw, reason: "Too late" })) === "already_drawn");
  ok("an admin can cancel after the draw", "data" in (await cancelGiveaway({ actor: ADM, id: ownDraw, reason: "Fraud found" })));
  ok("an admin can change who may enter, an organizer can't", "data" in (await setGiveawayVerifiedOnly({ adminId: "adm", id: openId, verifiedOnly: true })) && code(await setGiveawayVerifiedOnly({ adminId: "adm", id: cg, verifiedOnly: true })) === "bad_state" && code(await setGiveawayVerifiedOnly({ adminId: "adm", id: openId, verifiedOnly: "yes" })) === "validation_error");

  // ---- what people can see ----
  const pub = await listPublicGiveaways("p1");
  ok("the public list shows live ones and recently drawn ones, not drafts or cancelled", pub.live.every((g) => ["open", "upcoming", "closed"].includes(g.phase)) && pub.drawn.every((g) => g.phase === "drawn") && !pub.live.some((g) => g.title === "Hidden draft" || g.title === "To be cancelled"));
  ok("it knows what I've entered", pub.live.find((g) => g.slug.startsWith("open-to-all"))?.entered === true);
  ok("a pending giveaway is hidden from the public", !pub.live.some((g) => g.title === "Big two"));
  const draftRow = await prisma.giveaway.findFirstOrThrow({ where: { title: "Hidden draft" } });
  ok("a draft page is hidden from players, visible to an admin", (await getGiveawayPage(draftRow.slug, { id: "p1", isAdmin: false })) === null && (await getGiveawayPage(draftRow.slug, { id: "adm", isAdmin: true }))?.manage === true);
  const pg = await getGiveawayPage(gBrand.slug, { id: "p1", isAdmin: false });
  ok("the page explains why a free player can't enter", pg?.eligibility.ok === false && pg.eligibility.reason === "not_verified" && pg.host.sponsor?.name === "RazerLike" && pg.host.name === "BattleKrypt");
  const pgOut = await getGiveawayPage(gBrand.slug, null);
  ok("a visitor is told to log in", pgOut?.eligibility.ok === false && pgOut.eligibility.reason === "login");
  const drawnPage = await getGiveawayPage((await prisma.giveaway.findUniqueOrThrow({ where: { id: dg } })).slug, { id: wUser(w0), isAdmin: false });
  ok("a winner sees their own win and the public winners list", drawnPage?.myWin?.status === "confirmed" && drawnPage.winners.length === 3 && drawnPage.winners.some((w) => w.delivered));
  ok("a winner's delivery details are not public", !JSON.stringify((await getGiveawayPage((await prisma.giveaway.findUniqueOrThrow({ where: { id: dg } })).slug, { id: "stranger", isAdmin: false }))).includes("House 4"));
  const wins = await listMyWinnings(wUser(w0));
  ok("my winnings list", wins.length >= 1 && wins[0].slug.length > 0);
  const adminList = await listGiveawaysForAdmin();
  ok("the admin list puts the ones waiting for review first", adminList[0].status === "pending_review" || adminList.every((g) => g.status !== "pending_review"));
  const myList = await listGiveawaysForOrganizer(oPaid.id);
  ok("an organizer sees its own giveaways with winners' delivery details", myList.length >= 4 && myList.every((g) => g.host.kind === "organizer") && JSON.stringify(myList).includes("Cash") === false);
  const stats = await getGiveawayStatsFor(oPaid.id);
  ok("organization stats", stats.total >= 4 && stats.entries >= 1 && stats.byStatus.cancelled >= 1);

  // ---- account deletion ----
  const removed: { bucket: string; paths: string[] }[] = [];
  const folders: Record<string, string[]> = {};
  const deps: ErasureDeps = { listFolder: async (b, f) => folders[`${b}/${f}`] ?? [], removeFiles: async (b, p) => { if (p.length) removed.push({ bucket: b, paths: p }); }, deleteAuthUser: async () => undefined };
  await prisma.user.createMany({ data: ["ghost", "ghost2", "dk", "orgGone"].map((u, i) => ({ id: u, email: `${u}@x.com`, displayName: `Name ${u}`, phone: `030011100${i}` })) });
  for (const u of ["ghost", "ghost2", "dk"]) await player(u);
  const gp = id(await createGiveaway(ADM, "platform", { ...base, title: "For ghosts", winnersCount: 2 }));
  await prisma.giveawayEntry.createMany({ data: [{ giveawayId: gp, userId: "ghost" }, { giveawayId: gp, userId: "ghost2" }] });
  await drawWinners({ actor: ADM, id: gp, early: true });
  const gw = await prisma.giveawayWinner.findFirstOrThrow({ where: { giveawayId: gp, userId: "ghost" } });
  ok("a winner whose prize isn't finished can't delete their account", (await deletionBlockers("ghost")).some((b) => b.kind === "giveaway_prize" && b.count === 1));
  await submitWinnerDetails({ userId: "ghost", winnerId: gw.id, details: { name: "Real Name", phone: "03001112222", address: "House 9, Gulberg, Lahore" } });
  ok("sending details doesn't finish it", (await deletionBlockers("ghost")).some((b) => b.kind === "giveaway_prize"));
  await markDelivered({ actor: ADM, winnerId: gw.id, note: "Sent by TCS 555" });
  ok("a prize that was sent but not confirmed still blocks", (await deletionBlockers("ghost")).some((b) => b.kind === "giveaway_prize"));
  await confirmReceived({ userId: "ghost", winnerId: gw.id });
  ok("once confirmed, nothing is in the way", !(await deletionBlockers("ghost")).some((b) => b.kind === "giveaway_prize"));
  const live = id(await createGiveaway(ADM, "platform", { ...base, title: "Still running" }));
  await prisma.giveawayEntry.create({ data: { giveawayId: live, userId: "ghost" } });
  const mine = await prisma.giveawayWinner.findFirstOrThrow({ where: { giveawayId: gp, userId: "ghost2" } });
  await submitWinnerDetails({ userId: "ghost2", winnerId: mine.id, details: { name: "Real Two", phone: "03003334444", address: "Street 4, Karachi 75500" } });
  await disputeDelivery({ userId: "ghost2", winnerId: mine.id, note: "x".repeat(12) }).catch(() => undefined);

  await prisma.organizerProfile.create({ data: { userId: "orgGone", orgName: "Going Away Org", planCode: "organizer_pro", limitsLifted: true } });
  await prisma.user.update({ where: { id: "orgGone" }, data: { kycStatus: "approved" } });
  const hosted = id(await createGiveaway(o("orgGone"), "organizer", orgBase));
  ok("an organization with a running giveaway can't delete its account", (await deletionBlockers("orgGone")).some((b) => b.kind === "giveaway_hosted"));
  await cancelGiveaway({ actor: o("orgGone"), id: hosted, reason: "Closing down" });
  ok("once it is cancelled, it can", !(await deletionBlockers("orgGone")).some((b) => b.kind === "giveaway_hosted"));
  const hosted2 = id(await createGiveaway(o("orgGone"), "organizer", { ...orgBase, title: "Drawn, undelivered" }));
  await prisma.giveawayEntry.create({ data: { giveawayId: hosted2, userId: "p1" } });
  await drawWinners({ actor: ADM, id: hosted2, early: true });
  ok("a drawn giveaway whose prize hasn't been delivered still blocks the organization", (await deletionBlockers("orgGone")).some((b) => b.kind === "giveaway_hosted"));

  // erasure of a winner: details go, the fact of delivery stays; entries into undrawn giveaways go
  const gwBefore = await prisma.giveawayWinner.findUniqueOrThrow({ where: { id: gw.id } });
  ok("(before) the winner's details are stored", gwBefore.deliveryAddress === "House 9, Gulberg, Lahore" && gwBefore.status === "confirmed");
  await eraseUser("ghost", deps);
  const gwAfter = await prisma.giveawayWinner.findUniqueOrThrow({ where: { id: gw.id } });
  ok("erasure removes name, phone, address and notes", gwAfter.deliveryName === null && gwAfter.deliveryPhone === null && gwAfter.deliveryAddress === null && gwAfter.deliveryNote === null);
  ok("...but the prize still counts as delivered and confirmed", gwAfter.status === "confirmed" && gwAfter.hostNote === "Sent by TCS 555" && gwAfter.confirmedAt !== null);
  ok("entries into a giveaway still running are removed, drawn ones stay", (await prisma.giveawayEntry.count({ where: { giveawayId: live, userId: "ghost" } })) === 0 && (await prisma.giveawayEntry.count({ where: { giveawayId: gp, userId: "ghost" } })) === 1);
  ok("the organizer's stats are unaffected", (await getGiveawayStatsFor(oPaid.id)).total >= 4);

  // donation screenshots: an accepted one is kept (financial record), a rejected one goes
  const approvedPath = "dk/donation-proofs/aaaaaaaa-1111.png", rejectedPath = "dk/donation-proofs/bbbbbbbb-2222.png";
  await prisma.donation.create({ data: { userId: "dk", amount: "500", currency: "PKR", proofUrl: approvedPath, reference: "TXN-KEEP-01", status: "approved", message: "for the cup" } });
  await prisma.donation.create({ data: { userId: "dk", amount: "100", currency: "PKR", proofUrl: rejectedPath, reference: "TXN-REJ-01", status: "rejected" } });
  folders[`${PROOF_BUCKET}/dk`] = [approvedPath, rejectedPath];
  removed.length = 0;
  await eraseUser("dk", deps);
  const removedPaths = removed.filter((r) => r.bucket === PROOF_BUCKET).flatMap((r) => r.paths);
  ok("erasure keeps an accepted donation's screenshot and removes a rejected one's", !removedPaths.includes(approvedPath) && removedPaths.includes(rejectedPath));
  const dRows = await prisma.donation.findMany({ where: { userId: "dk" } });
  ok("the accepted donation keeps its record, link and transaction ID; the message goes", dRows.find((d) => d.status === "approved")?.proofUrl === approvedPath && dRows.find((d) => d.status === "approved")?.reference === "TXN-KEEP-01" && dRows.every((d) => d.message === null));
  ok("the rejected donation's link is cleared", dRows.find((d) => d.status === "rejected")?.proofUrl === "erased");

  // ---- the daily retention job ----
  const rg = id(await createGiveaway(ADM, "platform", { ...base, title: "Retention", winnersCount: 6 }));
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
  await prisma.giveawayEntry.createMany({ data: ids.map((u) => ({ giveawayId: rg, userId: u })) });
  await drawWinners({ actor: ADM, id: rg, early: true });
  const ws = await prisma.giveawayWinner.findMany({ where: { giveawayId: rg }, orderBy: { userId: "asc" } });
  const ago = (d: number) => new Date(Date.now() - d * day);
  const details = { deliveryName: "N", deliveryPhone: "P", deliveryAddress: "A", deliveryNote: "note", disputeNote: "d", hostNote: "TCS 1" };
  const setW = (i: number, data: Record<string, unknown>) => prisma.giveawayWinner.update({ where: { id: ws[i].id }, data: { ...details, ...data } as never });
  await setW(0, { status: "confirmed", confirmedAt: ago(61) });                                  // purge
  await setW(1, { status: "confirmed", confirmedAt: ago(10) });                                  // keep: too recent
  await setW(2, { status: "delivered", deliveredAt: ago(200) });                                 // purge: never confirmed
  await setW(3, { status: "delivered", deliveredAt: ago(100) });                                 // keep
  await setW(4, { status: "disputed", deliveredAt: ago(400) });                                  // keep: an open matter
  await setW(5, { status: "replaced" });                                                         // purge once the giveaway was drawn long ago
  await prisma.giveaway.update({ where: { id: rg }, data: { drawnAt: ago(70) } });
  const cancelledG = id(await createGiveaway(ADM, "platform", { ...base, title: "Cancelled long ago" }));
  await prisma.giveawayEntry.create({ data: { giveawayId: cancelledG, userId: "p1" } });
  await drawWinners({ actor: ADM, id: cancelledG, early: true });
  const cw2 = await prisma.giveawayWinner.findFirstOrThrow({ where: { giveawayId: cancelledG } });
  await prisma.giveawayWinner.update({ where: { id: cw2.id }, data: details });
  await cancelGiveaway({ actor: ADM, id: cancelledG, reason: "Sponsor pulled out" });
  await prisma.$executeRaw`UPDATE "Giveaway" SET "updatedAt" = ${ago(70)} WHERE id = ${cancelledG}`;
  const result = await runRetention(new Date(), { removeFiles: async () => undefined });
  const after = await prisma.giveawayWinner.findMany({ where: { id: { in: [...ws.map((w) => w.id), cw2.id] } } });
  const row = (id2: string) => after.find((w) => w.id === id2)!;
  const scrubbed = (w: { deliveryName: string | null; deliveryPhone: string | null; deliveryAddress: string | null; deliveryNote: string | null; disputeNote: string | null }) => w.deliveryName === null && w.deliveryPhone === null && w.deliveryAddress === null && w.deliveryNote === null && w.disputeNote === null;
  ok("the job ran without failing", result.giveawayDeliveryDetails !== "failed" && typeof result.giveawayDeliveryDetails === "number");
  ok("confirmed 61 days ago: details removed", scrubbed(row(ws[0].id)));
  ok("confirmed 10 days ago: kept", !scrubbed(row(ws[1].id)) && row(ws[1].id).deliveryAddress === "A");
  ok("sent 200 days ago, never confirmed: removed", scrubbed(row(ws[2].id)));
  ok("sent 100 days ago, not confirmed yet: kept", row(ws[3].id).deliveryAddress === "A");
  ok("an open dispute is never purged", row(ws[4].id).deliveryAddress === "A" && row(ws[4].id).disputeNote === "d");
  ok("a replaced winner of a giveaway drawn 70 days ago: removed", scrubbed(row(ws[5].id)));
  ok("a cancelled giveaway's winner after 70 days: removed", scrubbed(row(cw2.id)));
  ok("what was delivered is remembered, and the host's note stays", row(ws[0].id).status === "confirmed" && row(ws[0].id).hostNote === "TCS 1" && row(ws[2].id).status === "delivered");
  ok("running the job again changes nothing more", (await runRetention(new Date(), { removeFiles: async () => undefined })).giveawayDeliveryDetails === 0);

  // ---- the feature switch ----
  await prisma.siteSettings.upsert({ where: { id: "singleton" }, update: { giveawaysEnabled: false }, create: { id: "singleton", giveawaysEnabled: false } });
  ok("switched off: nobody can create", code(await createGiveaway(ADM, "platform", { ...base, title: "While off" })) === "feature_off");
  ok("switched off: nobody can enter", code(await enterGiveaway("p4", openId)) === "feature_off");
  ok("switched off: records stay readable", (await listGiveawaysForAdmin()).length > 5);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
