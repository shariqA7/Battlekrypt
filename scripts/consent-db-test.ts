// Needs a Postgres with all migrations applied (incl. 20261016000000_parental_consent).
// No Resend key is needed: with no RESEND_API_KEY the email is logged, and this test reads the link from that log.
process.env.NEXT_PUBLIC_PARENTAL_CONSENT_ENABLED = "true";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_TEST_TO;

import { prisma } from "../lib/prisma";
import { requestConsent, decideConsent, getConsentLinkInfo, getConsentStateForPlayer, checkConsentGate, consentStatusesForTournament } from "../lib/services/parental-consent";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const yearsAgo = (y: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() - y, d.getUTCMonth(), d.getUTCDate() - 1)); };

// Capture the emailed link instead of printing it.
let lastLink = "";
const realLog = console.log;
console.log = (...a: unknown[]) => { const m = /\/consent\/([A-Za-z0-9_-]+)/.exec(String(a[0])); if (m) lastLink = m[1]; else realLog(...a); };

async function main() {
  await prisma.user.createMany({ data: [
    { id: "org", email: "org@x.com", displayName: "Org", kycStatus: "approved" },
    { id: "kid", email: "kid@x.com", displayName: "Kid" },
    { id: "kid2", email: "kid2@x.com", displayName: "Kid2" },
    { id: "adult", email: "adult@x.com", displayName: "Adult" },
  ]});
  const org = await prisma.organizerProfile.create({ data: { userId: "org", orgName: "OrgCo" } });
  const kid = await prisma.playerProfile.create({ data: { userId: "kid", firstName: "Ahmed", lastName: "Khan", birthDate: yearsAgo(15) } });
  const kid2 = await prisma.playerProfile.create({ data: { userId: "kid2", firstName: "Sara", lastName: "Ali", birthDate: yearsAgo(16) } });
  const adult = await prisma.playerProfile.create({ data: { userId: "adult", firstName: "A", lastName: "Dult", birthDate: yearsAgo(30) } });
  const game = await prisma.game.create({ data: { name: "G" } });
  const base = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", entryType: "free", status: "registration_open" } as const;
  const tc = await prisma.tournament.create({ data: { ...base, slug: "tc", name: "Consent Cup", requireParentalConsent: true } });
  const tn = await prisma.tournament.create({ data: { ...base, slug: "tn", name: "Plain Cup" } });
  const regKid = await prisma.registration.create({ data: { tournamentId: tc.id, playerId: kid.id, status: "approved" } });
  const regAdult = await prisma.registration.create({ data: { tournamentId: tc.id, playerId: adult.id, status: "approved" } });

  // gate before any consent
  ok("gate holds a minor back when the tournament asks", err(await checkConsentGate(tc.id, kid.id)) === "consent_required");
  ok("gate ignores a tournament that doesn't ask", !err(await checkConsentGate(tn.id, kid.id)));
  ok("gate ignores adults", !err(await checkConsentGate(tc.id, adult.id)));
  let st = await consentStatusesForTournament(tc.id);
  ok("organizer sees pending for the minor and not required for the adult", st?.[regKid.id] === "pending" && st?.[regAdult.id] === "not_required");
  ok("a tournament that doesn't ask has no column", (await consentStatusesForTournament(tn.id)) === null);

  // requests
  ok("an adult can't request", err(await requestConsent({ userId: "adult", guardianEmail: "p@x.com", origin: "http://t" })) === "not_needed");
  ok("a bad email is refused", err(await requestConsent({ userId: "kid", guardianEmail: "nope", origin: "http://t" })) === "invalid_email");
  ok("the player's own email is refused", err(await requestConsent({ userId: "kid", guardianEmail: "KID@x.com", origin: "http://t" })) === "same_email");
  const r1 = await requestConsent({ userId: "kid", guardianEmail: "Mum@X.com", requestedFor: "Consent Cup", origin: "http://t" });
  ok("a valid request is sent", !err(r1) && lastLink.length > 40);
  const tokenA = lastLink;
  ok("state is pending", (await getConsentStateForPlayer(kid.id)).state === "pending");
  const stored = await prisma.parentalConsent.findFirst({ where: { playerId: kid.id } });
  ok("only a hash is stored, never the token", !!stored && stored.tokenHash !== tokenA && !JSON.stringify(stored).includes(tokenA));
  ok("the address is stored lower-case", stored?.guardianEmail === "mum@x.com");
  const info = await getConsentLinkInfo(tokenA);
  ok("the link shows the child as first name + initial", info.ok && info.childName === "Ahmed K.");

  // a second request supersedes the first
  await requestConsent({ userId: "kid", guardianEmail: "dad@x.com", origin: "http://t" });
  const tokenB = lastLink;
  ok("the older link stops working", (await getConsentLinkInfo(tokenA)).ok === false);
  ok("the newer link works", (await getConsentLinkInfo(tokenB)).ok === true);

  // rate limit: 3 per day (we have sent 2)
  await requestConsent({ userId: "kid", guardianEmail: "gran@x.com", origin: "http://t" });
  ok("a 4th request in a day is refused", err(await requestConsent({ userId: "kid", guardianEmail: "aunt@x.com", origin: "http://t" })) === "too_many");
  const tokenC = lastLink;

  // signing
  ok("approving needs both boxes", err(await decideConsent(tokenC, { action: "approve", signedName: "Gran Khan", confirmGuardian: true, agree: false })) === "not_confirmed");
  ok("the player can't sign as themselves", err(await decideConsent(tokenC, { action: "approve", signedName: "ahmed khan", confirmGuardian: true, agree: true })) === "invalid_name");
  ok("a junk name is refused", err(await decideConsent(tokenC, { action: "approve", signedName: "x", confirmGuardian: true, agree: true })) === "invalid_name");
  ok("a wrong token is refused", err(await decideConsent("nope", { action: "approve", signedName: "Gran Khan", confirmGuardian: true, agree: true })) === "not_found");
  const signed = await decideConsent(tokenC, { action: "approve", signedName: "  Gran   Khan ", confirmGuardian: true, agree: true, ip: "203.0.113.9", userAgent: "TestAgent" });
  ok("a guardian can approve", !err(signed));
  const rec = await prisma.parentalConsent.findFirst({ where: { playerId: kid.id, status: "approved" } });
  const days = rec?.validUntil && rec.decidedAt ? Math.round((rec.validUntil.getTime() - rec.decidedAt.getTime()) / 86400000) : 0;
  ok("it is valid for one year", days === 365);
  ok("the signature, IP, waiver version and exact waiver text are saved", rec?.signedName === "Gran Khan" && rec.signedIp === "203.0.113.9" && !!rec.waiverVersion && (rec.waiverText ?? "").includes("only for players aged 18 or over"));
  ok("the link can't be used twice", err(await decideConsent(tokenC, { action: "approve", signedName: "Gran Khan", confirmGuardian: true, agree: true })) === "already_used");
  ok("the player is now approved", (await getConsentStateForPlayer(kid.id)).state === "approved");
  ok("the gate opens", !err(await checkConsentGate(tc.id, kid.id)));
  st = await consentStatusesForTournament(tc.id);
  ok("organizer now sees approved", st?.[regKid.id] === "approved");
  ok("a new request when already approved sends nothing", (await requestConsent({ userId: "kid", guardianEmail: "x@x.com", origin: "http://t" })) && (await prisma.parentalConsent.count({ where: { playerId: kid.id } })) === 3);

  // expiry: push validity into the past
  await prisma.parentalConsent.update({ where: { id: rec!.id }, data: { validUntil: new Date(Date.now() - 1000) } });
  ok("after a year it expires and the gate closes again", (await getConsentStateForPlayer(kid.id)).state === "expired" && err(await checkConsentGate(tc.id, kid.id)) === "consent_required");

  // decline + expired link
  await requestConsent({ userId: "kid2", guardianEmail: "mum2@x.com", origin: "http://t" });
  const tokenD = lastLink;
  ok("a guardian can decline", !err(await decideConsent(tokenD, { action: "decline" })) && (await getConsentStateForPlayer(kid2.id)).state === "declined");
  await requestConsent({ userId: "kid2", guardianEmail: "mum3@x.com", origin: "http://t" });
  const tokenE = lastLink;
  await prisma.parentalConsent.updateMany({ where: { playerId: kid2.id, status: "pending" }, data: { linkExpiresAt: new Date(Date.now() - 1000) } });
  ok("an expired link is refused", err(await decideConsent(tokenE, { action: "approve", signedName: "Mum Ali", confirmGuardian: true, agree: true })) === "expired");

  // platform switch off -> nothing is gated
  process.env.NEXT_PUBLIC_PARENTAL_CONSENT_ENABLED = "false";
  ok("switch off: the gate is open", !err(await checkConsentGate(tc.id, kid2.id)));
  ok("switch off: requests are refused", err(await requestConsent({ userId: "kid2", guardianEmail: "m@x.com", origin: "http://t" })) === "consent_disabled");
  ok("switch off: no organizer column", (await consentStatusesForTournament(tc.id)) === null);
}
main().catch((e) => { console.log = realLog; console.error(e); fails++; }).finally(async () => { console.log = realLog; await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
