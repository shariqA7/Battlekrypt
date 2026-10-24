// Needs a Postgres with ALL migrations applied and an EMPTY database (it creates fixed ids).
// No email key needed: emails are logged. Run: npx tsx scripts/guardian-db-test.ts
process.env.NEXT_PUBLIC_PARENTAL_CONSENT_ENABLED = "true";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_TEST_TO;
delete process.env.PAYOUT_ENCRYPTION_KEY;

import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import { requestSignupConsent, decideConsent, getConsentStateForPlayer, getManageInfo, withdrawConsent, saveGuardianPayout } from "../lib/services/parental-consent";
import { checkAgeGate } from "../lib/services/age-gate";
import { getPayoutSummary, getPayoutText, savePayoutMethod, listPrizePayees } from "../lib/services/payout-methods";
import { countOpenConsentCases, decideConsentCase, listConsentCases, openConsentCases } from "../lib/services/consent-cases";
import { updatePlayerProfile } from "../lib/services/tournaments";
import { completeSignIn } from "../lib/post-login";
import type { User as SupaUser } from "@supabase/supabase-js";
import { getOnboardingData, needsOnboarding, saveOnboardingStep } from "../lib/services/onboarding";
import { getPlayerRanking, modesWithPlayers, rankedCounts } from "../lib/services/rankings";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const yearsAgo = (y: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() - y, d.getUTCMonth(), d.getUTCDate() - 1)); };

let lastRequestToken = "";
const realLog = console.log;
console.log = (...a: unknown[]) => {
  const m = /\/consent\/([A-Za-z0-9_-]{30,})/.exec(String(a[0]));
  if (m) lastRequestToken = m[1]; else realLog(...a);
};
const acct = { method: "JazzCash", payeeName: "Sara Khan", details: "0300-1234567" };

async function main() {
  await prisma.user.createMany({ data: [
    { id: "g-org", email: "g-org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "g-kid", email: "g-kid@x.com", displayName: "Ahmed Khan" },
    { id: "g-adult", email: "g-adult@x.com", displayName: "Ali Raza" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "g-org", orgName: "OrgCo" } });
  const kid = await prisma.playerProfile.create({ data: { userId: "g-kid", firstName: "Ahmed", lastName: "Khan", birthDate: yearsAgo(15), age: 15, guardianEmail: "Mum@X.com" } });
  const adult = await prisma.playerProfile.create({ data: { userId: "g-adult", firstName: "Ali", lastName: "Raza", birthDate: yearsAgo(30), age: 30, username: "ali_r" } });
  const game = await prisma.game.create({ data: { name: "GuardianTestGame", teamSizeMax: 5, genre: "MOBA", format: "multiplayer" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", status: "registration_open" } as const;
  const free = await prisma.tournament.create({ data: { ...base, slug: "g-free", name: "Free Cup", entryType: "free" } });
  const paid = await prisma.tournament.create({ data: { ...base, slug: "g-paid", name: "Prize Cup", entryType: "free", prizePoolAmount: 1000, prizePoolCurrency: "USD" } });
  const running = await prisma.tournament.create({ data: { ...base, slug: "g-run", name: "Running Cup", entryType: "free", status: "in_progress" } });

  // ---- minors can't join until approved
  ok("a minor can't join before approval", err(await checkAgeGate(free.id, [kid.id], { selfPlayerId: kid.id })) === "consent_required");
  ok("an adult can join", !err(await checkAgeGate(free.id, [adult.id], { selfPlayerId: adult.id })));
  ok("a minor on a team entry blocks the whole entry", err(await checkAgeGate(free.id, [adult.id, kid.id], { selfPlayerId: adult.id })) === "consent_required");

  // ---- the sign-up request goes to the guardian from the form, once
  const sent = await requestSignupConsent("g-kid", "http://t");
  ok("sign-up consent request is sent to the guardian email", !err(sent) && lastRequestToken.length > 30);
  const row = await prisma.parentalConsent.findFirst({ where: { playerId: kid.id } });
  ok("it went to the lower-cased guardian email", row?.guardianEmail === "mum@x.com");
  ok("asking again does nothing (no spam)", "skipped" in (await requestSignupConsent("g-kid", "http://t")));
  ok("an adult is skipped", "skipped" in (await requestSignupConsent("g-adult", "http://t")));

  // ---- approving gives the guardian a manage link
  const done = await decideConsent(lastRequestToken, { action: "approve", signedName: "Sara Khan", confirmGuardian: true, agree: true, ip: "203.0.113.9" });
  const manage = "data" in done && done.data.status === "approved" ? (done.data as { manageToken?: string }).manageToken ?? "" : "";
  ok("approval returns a manage token", manage.length > 30);
  const stored = await prisma.parentalConsent.findFirst({ where: { playerId: kid.id } });
  ok("only the HASH of the manage token is stored", !!stored?.manageTokenHash && stored.manageTokenHash !== manage && !JSON.stringify(stored).includes(manage));
  ok("state is approved", (await getConsentStateForPlayer(kid.id)).state === "approved");
  ok("the approved minor can now join a free tournament", !err(await checkAgeGate(free.id, [kid.id], { selfPlayerId: kid.id })));

  // ---- cash prize tournaments need the guardian's payment details first
  ok("a prize tournament still blocks until the guardian adds payment details", err(await checkAgeGate(paid.id, [kid.id], { selfPlayerId: kid.id })) === "guardian_payout_required");
  ok("saving payment details is refused without an encryption key", err(await saveGuardianPayout(manage, acct)) === "not_configured");
  process.env.PAYOUT_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  ok("a bad payout form is refused", err(await saveGuardianPayout(manage, { ...acct, details: "1" })) === "invalid_details");
  ok("the guardian saves payment details", !err(await saveGuardianPayout(manage, acct)));
  const dbRow = await prisma.playerPayoutMethod.findUnique({ where: { playerId: kid.id } });
  ok("the account number is encrypted in the database", !!dbRow && !dbRow.detailsEnc.includes("0300") && dbRow.payee === "guardian");
  ok("the minor can now enter the prize tournament", !err(await checkAgeGate(paid.id, [kid.id], { selfPlayerId: kid.id })));
  const text = await getPayoutText(kid.id);
  ok("the payer sees the guardian, told not to pay the child", !!text && /PARENT\/GUARDIAN of Ahmed K\./.test(text) && text.includes("0300-1234567") && text.includes("Sara Khan"));
  ok("the summary never contains the account number", !JSON.stringify(await getPayoutSummary(kid.id)).includes("0300"));
  ok("a minor can't point their own prizes anywhere", err(await savePayoutMethod(kid.id, "self", acct)) === "guardian_only");
  ok("a guardian method can't be saved for an adult", err(await savePayoutMethod(adult.id, "guardian", acct)) === "not_a_minor");
  ok("an adult saves their own", !err(await savePayoutMethod(adult.id, "self", { method: "Bank transfer", payeeName: "Ali Raza", details: "PK00TEST0000" })));
  ok("an adult's payout text is plain", !/GUARDIAN/.test((await getPayoutText(adult.id)) ?? "GUARDIAN"));

  // ---- organizer sees who to pay (winner is the minor)
  const regPaid = await prisma.registration.create({ data: { tournamentId: paid.id, playerId: kid.id, status: "approved", placement: 1 } });
  await prisma.prizeTier.create({ data: { tournamentId: paid.id, positionFrom: 1, positionTo: 1, amount: 600 } });
  const payees = await listPrizePayees(paid.id);
  ok("organizer's prize list shows the guardian's account", payees.length === 1 && payees[0].registrationId === regPaid.id && /PARENT\/GUARDIAN/.test(payees[0].payees[0].text ?? ""));

  // ---- withdrawal
  const regFree = await prisma.registration.create({ data: { tournamentId: free.id, playerId: kid.id, status: "approved" } });
  const regRun = await prisma.registration.create({ data: { tournamentId: running.id, playerId: kid.id, status: "approved" } });
  const info = await getManageInfo(manage);
  ok("manage page info is active", info.ok && info.active && info.childName === "Ahmed K.");
  ok("a wrong manage token is not found", !(await getManageInfo("x".repeat(43))).ok);
  const w = await withdrawConsent(manage);
  ok("withdrawal succeeds", "data" in w && !w.data.alreadyWithdrawn);
  ok("withdrawn state", (await getConsentStateForPlayer(kid.id)).state === "withdrawn");
  ok("an upcoming entry is cancelled", (await prisma.registration.findUnique({ where: { id: regFree.id } }))?.status === "rejected");
  ok("the prize tournament entry is cancelled too", (await prisma.registration.findUnique({ where: { id: regPaid.id } }))?.status === "rejected");
  ok("an entry in a RUNNING tournament is left alone", (await prisma.registration.findUnique({ where: { id: regRun.id } }))?.status === "approved");
  const orgNotes = await prisma.notification.findMany({ where: { userId: "g-org", type: "consent_withdrawn" } });
  ok("organizer is told about each affected tournament", orgNotes.length === 3);
  ok("the running tournament note says it was NOT removed", orgNotes.some((n) => /NOT removed/.test(n.body ?? "")));
  ok("the child is told", (await prisma.notification.count({ where: { userId: "g-kid", type: "consent_withdrawn" } })) === 1);
  // ---- the admin queue for entries in a running tournament
  const cases = await listConsentCases("open");
  ok("only the RUNNING tournament made a case", cases.length === 1 && cases[0].tournamentName === "Running Cup");
  ok("the case shows the child as 'Ahmed K.', not the full name", cases[0].childName === "Ahmed K." && !JSON.stringify(cases).includes("Khan"));
  ok("it shows the guardian's current consent state", cases[0].consentNow === "withdrawn");
  ok("the badge counts open cases", (await countOpenConsentCases()) === 1);
  await openConsentCases(kid.id, [{ id: regRun.id, tournamentId: running.id }]);
  ok("opening the same case twice doesn't duplicate it", (await countOpenConsentCases()) === 1);
  const allow = await decideConsentCase(cases[0].id, "g-org", "allow", "Finish the final");
  ok("an admin can let them finish", "data" in allow && (await prisma.registration.findUnique({ where: { id: regRun.id } }))?.status === "approved");
  ok("a decided case leaves the queue", (await countOpenConsentCases()) === 0 && (await listConsentCases("decided")).length === 1);
  ok("deciding twice is refused", err(await decideConsentCase(cases[0].id, "g-org", "remove")) === "already_decided");
  ok("an unknown case is not found", err(await decideConsentCase("00000000-0000-0000-0000-000000000000", "g-org", "allow")) === "not_found");
  ok("the organizer and the child are told the decision", (await prisma.notification.count({ where: { userId: "g-org", type: "consent_case" } })) === 1 && (await prisma.notification.count({ where: { userId: "g-kid", type: "consent_case" } })) === 1);
  const running2 = await prisma.tournament.create({ data: { ...base, slug: "g-run2", name: "Second Running Cup", entryType: "free", status: "in_progress" } });
  const regRun2 = await prisma.registration.create({ data: { tournamentId: running2.id, playerId: kid.id, status: "approved" } });
  await openConsentCases(kid.id, [{ id: regRun2.id, tournamentId: running2.id }]);
  const c2 = (await listConsentCases("open"))[0];
  ok("a removal disqualifies the entry", "data" in (await decideConsentCase(c2.id, "g-org", "remove")) && (await prisma.registration.findUnique({ where: { id: regRun2.id } }))?.status === "disqualified");
  ok("a withdrawn minor can't join again", err(await checkAgeGate(free.id, [kid.id], { selfPlayerId: kid.id })) === "consent_required");
  ok("withdrawing twice is harmless", "data" in (await withdrawConsent(manage)) && (await withdrawConsent(manage) as { data: { alreadyWithdrawn: boolean } }).data.alreadyWithdrawn);
  ok("payment details can't be changed after withdrawal", err(await saveGuardianPayout(manage, acct)) === "not_active");
  const after = await getManageInfo(manage);
  ok("manage page now shows withdrawn", after.ok && after.status === "revoked" && !after.active);

  // ---- turning 18: the guardian's account stops being used
  await prisma.playerProfile.update({ where: { id: kid.id }, data: { birthDate: yearsAgo(18) } });
  ok("at 18 the guardian payout method is no longer used", (await getPayoutText(kid.id)) === null);
  const sum = await getPayoutSummary(kid.id);
  ok("and they are asked to add their own", sum.needsReentry && !sum.usable && !sum.minor);

  // ---- rankings
  const g2 = await prisma.game.create({ data: { name: "RankTestGame", teamSizeMax: 4, genre: "Battle Royale", format: "multiplayer" } });
  const ps = [];
  for (let i = 0; i < 4; i++) {
    await prisma.user.create({ data: { id: `rk${i}`, email: `rk${i}@x.com`, displayName: `Rank Player ${i}` } });
    ps.push(await prisma.playerProfile.create({ data: { userId: `rk${i}`, birthDate: i === 3 ? yearsAgo(14) : yearsAgo(25), username: i === 3 ? null : `rk_user${i}` } }));
  }
  await prisma.playerGameRating.createMany({ data: [
    { playerId: ps[0].id, gameId: g2.id, mode: "squad", rating: 1600 },
    { playerId: ps[1].id, gameId: g2.id, mode: "squad", rating: 1500 },
    { playerId: ps[2].id, gameId: g2.id, mode: "squad", rating: 1500 },
    { playerId: ps[3].id, gameId: g2.id, mode: "squad", rating: 1300 },
    { playerId: ps[0].id, gameId: g2.id, mode: "solo", rating: 1100 },
  ]});
  const modes = await modesWithPlayers(g2.id);
  ok("only modes with players are listed", modes.length === 2 && modes.includes("squad") && modes.includes("solo"));
  const sq = await getPlayerRanking(g2.id, "squad", 1);
  ok("squad ranking is ordered by rating", sq.rows.map((r) => r.rating).join() === "1600,1500,1500,1300");
  ok("ties share a rank", sq.rows.map((r) => r.rank).join() === "1,2,2,4");
  ok("solo ranking is separate from squad", (await getPlayerRanking(g2.id, "solo", 1)).total === 1);
  ok("a child without a username shows only as 'Player'", sq.rows[3].name === "Player");
  ok("usernames show for others", sq.rows[0].name === "rk_user0");
  ok("no real names leak into the table", !JSON.stringify(sq).includes("Rank Player"));
  // ---- social sign-ins pick a username once
  await prisma.user.create({ data: { id: "so1", email: "so1@x.com", displayName: "Social One" } });
  const so = await prisma.playerProfile.create({ data: { userId: "so1" } });
  const prof = { firstName: "Social", lastName: "One", birthDate: "1995-05-05" };
  ok("a social user can't finish the profile without a username", err(await updatePlayerProfile("so1", prof)) === "username_required");
  ok("a reserved username is refused", err(await updatePlayerProfile("so1", { ...prof, username: "Admin" })) === "username_invalid");
  ok("a username with symbols is refused", err(await updatePlayerProfile("so1", { ...prof, username: "no way!" })) === "username_invalid");
  ok("a taken username is refused (any case)", err(await updatePlayerProfile("so1", { ...prof, username: "ALI_R" })) === "username_invalid");
  ok("nothing was saved by the failed attempts", (await prisma.playerProfile.findUnique({ where: { id: so.id } }))?.username === null);
  ok("a good username is saved, lower-cased", !err(await updatePlayerProfile("so1", { ...prof, username: "Social_One" })) && (await prisma.playerProfile.findUnique({ where: { id: so.id } }))?.username === "social_one");
  ok("it can't be changed afterwards", !err(await updatePlayerProfile("so1", { ...prof, username: "something_else" })) && (await prisma.playerProfile.findUnique({ where: { id: so.id } }))?.username === "social_one");
  ok("later edits don't need the username again", !err(await updatePlayerProfile("so1", prof)));

  // ---- onboarding
  await prisma.game.create({ data: { name: "OnbGlobalGame", genre: "MOBA", format: "multiplayer", teamSizeMax: 5 } });
  await prisma.game.create({ data: { name: "OnbIndiaOnlyGame", genre: "Battle Royale", format: "multiplayer", teamSizeMax: 4, onlyInCountries: ["IN"] } });
  await prisma.user.createMany({ data: [
    { id: "ob-social", email: "ob-social@x.com", displayName: "Social Person" },
    { id: "ob-pw", email: "ob-pw@x.com", displayName: "Password Person" },
    { id: "ob-kid", email: "ob-kid@x.com", displayName: "Kid Social" },
  ]});
  await prisma.playerProfile.create({ data: { userId: "ob-social" } });
  await prisma.playerProfile.create({ data: { userId: "ob-pw", firstName: "Pat", lastName: "Word", username: "pat_word", birthDate: yearsAgo(28), age: 28, country: "Pakistan" } });
  await prisma.playerProfile.create({ data: { userId: "ob-kid" } });
  const o = (u: string, body: object) => saveOnboardingStep(u, body, "http://t");
  const failedIds = (r: { checks: { id: string; ok: boolean }[] }) => r.checks.filter((c) => !c.ok).map((c) => c.id);

  ok("a new social user needs onboarding", await needsOnboarding("ob-social"));
  ok("a new PASSWORD user needs it too (first login, everyone)", await needsOnboarding("ob-pw"));
  ok("an organizer account is left alone", !(await needsOnboarding("g-org")));
  ok("someone with no profile isn't sent anywhere", !(await needsOnboarding("nobody-here")));
  const dSocial = await getOnboardingData("ob-social");
  const dPw = await getOnboardingData("ob-pw");
  ok("a social user is asked the 'about you' step", !!dSocial?.needsAbout);
  ok("a password user is NOT asked it again", dPw?.needsAbout === false);

  // about step
  const bad = await o("ob-social", { step: "about", firstName: "Sam", lastName: "Lee", username: "admin", birthDate: "1999-01-01", country: "PK" });
  ok("a bad username is refused with a tick/cross list", !bad.ok && failedIds(bad).join() === "username_reserved");
  ok("nothing is saved when a check fails", (await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } }))?.username === null);
  ok("an under-13 is refused and no date of birth is stored", !(await o("ob-social", { step: "about", firstName: "Sam", lastName: "Lee", username: "sam_lee", birthDate: yearsAgo(12).toISOString().slice(0, 10), country: "PK" })).ok && (await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } }))?.birthDate === null);
  ok("a taken username is refused", failedIds(await o("ob-social", { step: "about", firstName: "Sam", lastName: "Lee", username: "ALI_R", birthDate: "1999-01-01", country: "PK" })).join() === "username_free");
  ok("finish is blocked until the details are in", !(await o("ob-social", { step: "finish" })).ok);
  const aboutDone = await o("ob-social", { step: "about", firstName: "Sam", lastName: "Lee", username: "Sam_Lee", birthDate: "1999-01-01", country: "PK" });
  const saved = await prisma.playerProfile.findUnique({ where: { userId: "ob-social" }, include: { user: true } });
  ok("a good about step saves everything", aboutDone.ok && saved?.username === "sam_lee" && saved.firstName === "Sam" && saved.country === "Pakistan" && saved.birthDate !== null && saved.age !== null);
  ok("the display name follows the name they typed", saved?.user.displayName === "Sam Lee");
  ok("asking the about step again changes nothing (locked)", (await o("ob-social", { step: "about", firstName: "Hacker", username: "hacker", birthDate: "1980-01-01" })).ok && (await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } }))?.username === "sam_lee");

  // a minor via social login: guardian email + consent request
  ok("a minor must give a guardian email", failedIds(await o("ob-kid", { step: "about", firstName: "Kid", lastName: "Gamer", username: "kid_gamer", birthDate: yearsAgo(14).toISOString().slice(0, 10), country: "PK" })).join() === "guardian_email");
  lastRequestToken = "";
  const kidDone = await o("ob-kid", { step: "about", firstName: "Kid", lastName: "Gamer", username: "kid_gamer", birthDate: yearsAgo(14).toISOString().slice(0, 10), country: "PK", guardianEmail: "Parent@X.com" });
  const kidProfile = await prisma.playerProfile.findUnique({ where: { userId: "ob-kid" } });
  ok("the guardian email is saved lower-cased", kidDone.ok && kidProfile?.guardianEmail === "parent@x.com");
  ok("the guardian is emailed right away", lastRequestToken.length > 30 && (await getConsentStateForPlayer(kidProfile!.id)).state === "pending");

  // games step, filtered by the player's country
  const gOk = await o("ob-social", { step: "games", games: ["OnbGlobalGame"] });
  ok("picking a visible game works", gOk.ok && (await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } }))?.favoriteGames.join() === "OnbGlobalGame");
  ok("a game restricted to another country is refused (PK player)", failedIds(await o("ob-social", { step: "games", games: ["OnbIndiaOnlyGame"] })).join() === "games_known");
  ok("an invented game is refused", !(await o("ob-social", { step: "games", games: ["Totally Made Up"] })).ok);
  ok("the picker only lists games this player may see", (await getOnboardingData("ob-social"))?.games.some((g) => g.name === "OnbIndiaOnlyGame") === false);
  ok("an empty pick is allowed and clears it", (await o("ob-social", { step: "games", games: [] })).ok);

  // style step
  ok("an invalid play style is refused", failedIds(await o("ob-social", { step: "style", playStyle: "tryhard" })).join() === "play_style");
  const st = await o("ob-social", { step: "style", playStyle: "competitive", gender: "female", hobbies: "chess" });
  const sp = await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } });
  ok("play style, gender and hobbies are saved", st.ok && sp?.playStyle === "competitive" && sp.gender === "female" && sp.hobbies === "chess");

  // finishing
  ok("finish succeeds once the details are in", (await o("ob-social", { step: "finish" })).ok);
  ok("they are no longer sent to onboarding", !(await needsOnboarding("ob-social")) && (await prisma.playerProfile.findUnique({ where: { userId: "ob-social" } }))?.onboardedAt !== null);
  ok("a password user can finish without any about step", (await o("ob-pw", { step: "finish" })).ok && !(await needsOnboarding("ob-pw")));
  ok("an unknown step is refused", !(await o("ob-pw", { step: "hack" })).ok);
  ok("a user who skipped everything but finished still isn't re-sent", !(await needsOnboarding("ob-pw")));
  await prisma.playerProfile.update({ where: { userId: "ob-pw" }, data: { username: null } });
  ok("a finished player who somehow has no username is sent back (required details)", await needsOnboarding("ob-pw"));

  // ---- what happens after ANY sign-in route (OAuth or an emailed link)
  const fakeUser = (id: string, meta: Record<string, unknown>) =>
    ({ id, email: `${id}@x.com`, user_metadata: meta, app_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() }) as unknown as SupaUser;
  const signupMeta = (over: object = {}) => ({
    full_name: "Cee Ess",
    signup_profile: { firstName: "Cee", lastName: "Ess", username: "cee_ess", country: "PK", birthDate: "1998-02-03", phone: "", guardianEmail: "", marketingEmail: false, terms: "v1", ...over },
  });
  const afterNew = await completeSignIn(fakeUser("cs-new", signupMeta()), "http://t", "/tournaments");
  ok("a new password sign-up is sent to onboarding, remembering where they were going", afterNew === "/onboarding?redirectTo=%2Ftournaments");
  const csProfile = await prisma.playerProfile.findUnique({ where: { userId: "cs-new" } });
  ok("the profile was built from the sign-up form's answers", csProfile?.username === "cee_ess" && csProfile.country === "Pakistan" && csProfile.firstName === "Cee");
  await prisma.playerProfile.update({ where: { userId: "cs-new" }, data: { onboardedAt: new Date() } });
  ok("once onboarded, the same link goes straight to the destination", (await completeSignIn(fakeUser("cs-new", signupMeta()), "http://t", "/tournaments")) === "/tournaments");
  ok("signing in twice doesn't duplicate or reset the profile", (await prisma.playerProfile.count({ where: { userId: "cs-new" } })) === 1);
  ok("a password-reset link goes straight to the reset page, even for a brand-new account", (await completeSignIn(fakeUser("cs-reset", signupMeta({ username: "cee_reset" })), "http://t", "/reset-password")) === "/reset-password");
  ok("an organization sign-up goes to its application page", (await completeSignIn(fakeUser("cs-org", { org_application: { orgName: "NotValidOnPurpose" } }), "http://t", "/")) === "/organizer/application");
  lastRequestToken = "";
  const minorMeta = signupMeta({ username: "cee_minor", birthDate: yearsAgo(14).toISOString().slice(0, 10), guardianEmail: "gran@x.com" });
  const afterMinor = await completeSignIn(fakeUser("cs-minor", minorMeta), "http://t", "/");
  ok("a minor is sent to onboarding AND the guardian is emailed on confirmation", afterMinor.startsWith("/onboarding") && lastRequestToken.length > 30);
  ok("a forged under-13 date of birth in the metadata is dropped", (await prisma.playerProfile.findUnique({ where: { userId: "cs-minor" } }))?.guardianEmail === "gran@x.com" && !(await completeSignIn(fakeUser("cs-forged", signupMeta({ username: "cee_forged", birthDate: "2020-01-01" })), "http://t", "/")).includes("undefined") && (await prisma.playerProfile.findUnique({ where: { userId: "cs-forged" } }))?.birthDate === null);

  const counts = await rankedCounts([g2.id]);
  ok("the game picker counts ranked players", counts.players.get(g2.id) === 5);
}
main().catch((e) => { console.log = realLog; console.error(e); fails++; }).finally(async () => { console.log = realLog; await prisma.$disconnect(); console.log(fails ? `\n${fails} FAILED` : "\nAll passed"); process.exit(fails ? 1 : 0); });
