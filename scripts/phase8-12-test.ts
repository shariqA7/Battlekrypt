// The stored student ID: added once, reused by every tournament that asks for one,
// kept until the player removes it, and only needing a new one when it expires.
// Needs a Postgres with all migrations applied. See phase8-1-test.ts for how to run.
import { prisma } from "../lib/prisma";
import { studentIdStatus, parseIdDate, ID_EXPIRING_SOON_DAYS } from "../lib/student-id-status";
import { saveStudentId, removeStudentId, getStudentId, getOwnStudentIdPath, liveEntriesUsingPhoto } from "../lib/services/student-id";
import { registerForTournament, manualAddRegistration, rejectRegistration } from "../lib/services/tournaments";
import { createInstitution, setInstitutionVerified, setPlayerInstitution, countActiveEntries } from "../lib/services/institutions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const DAY = 24 * 60 * 60 * 1000;
const day = (offset: number, from = new Date()) => new Date(from.getTime() + offset * DAY).toISOString().slice(0, 10);
const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  // ---------- the pure rules
  const base = { idImagePath: "u/a.jpg", idInstitutionId: "I1", institutionId: "I1" };
  const now = new Date("2026-10-15T12:00:00Z");
  ok("nothing stored -> none", studentIdStatus({ ...base, idImagePath: null, idExpiresAt: null }, now).status === "none");
  ok("no expiry date on the card -> valid for good", studentIdStatus({ ...base, idExpiresAt: null }, now).status === "valid");
  ok("far-off expiry -> valid", studentIdStatus({ ...base, idExpiresAt: D("2028-01-01") }, now).status === "valid");
  ok(`within ${ID_EXPIRING_SOON_DAYS} days -> expiring (still usable)`, studentIdStatus({ ...base, idExpiresAt: D("2026-11-10") }, now).status === "expiring");
  ok("the card is good THROUGH its expiry date", studentIdStatus({ ...base, idExpiresAt: D("2026-10-15") }, now).status === "expiring");
  ok("the day after the expiry date -> expired", studentIdStatus({ ...base, idExpiresAt: D("2026-10-14") }, now).status === "expired");
  ok("added for a different institute -> not usable", studentIdStatus({ ...base, idInstitutionId: "I0", idExpiresAt: null }, now).status === "other_institute");
  ok("no current institute -> not usable", studentIdStatus({ ...base, institutionId: null, idExpiresAt: null }, now).status === "other_institute");
  ok("date parsing accepts real dates only", !!parseIdDate("2027-02-28") && parseIdDate("2027-02-30") === null && parseIdDate("27-02-28") === null && parseIdDate("") === null && parseIdDate(5) === null);

  // ---------- set up an institute, a host, two players, two tournaments
  await prisma.user.createMany({ data: ["adm", "host", "p1", "p2", "p3", "p4"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: u, isAdmin: u === "adm" })) });
  const org = await prisma.organizerProfile.create({ data: { userId: "host", orgName: "FAST", planCode: "organizer_pro" } });
  const fast = await createInstitution(org.id, "FAST University");
  const other = await createInstitution((await prisma.organizerProfile.create({ data: { userId: "adm", orgName: "LUMS", planCode: "organizer_pro" } })).id, "LUMS");
  if (!("data" in fast) || !("data" in other)) throw new Error("institutes");
  await setInstitutionVerified(fast.data.id, "adm", true);
  await setInstitutionVerified(other.data.id, "adm", true);
  const prof: Record<string, string> = {};
  for (const u of ["p1", "p2", "p3", "p4"]) {
    prof[u] = (await prisma.playerProfile.create({ data: { birthDate: new Date("2000-01-01"), userId: u, firstName: u, lastName: "x", planCode: "player_basic" } })).id;
  }
  const long = new Date(Date.now() - 30 * DAY);
  await setPlayerInstitution("p1", { institutionId: fast.data.id, studentId: null, acknowledged: false }, long);
  await setPlayerInstitution("p2", { institutionId: fast.data.id, studentId: null, acknowledged: false }, long);
  await setPlayerInstitution("p4", { institutionId: fast.data.id, studentId: null, acknowledged: false }, long);
  const game = await prisma.game.create({ data: { name: "G", isApproved: true } });
  const t = { organizerId: org.id, gameId: game.id, type: "tournament", mode: "solo", maxTeams: 50, format: "single_elimination", status: "registration_open", audienceScope: "institution", entryType: "free", requireFreshInstitutionProof: true } as const;
  const cupA = await prisma.tournament.create({ data: { ...t, slug: "a", name: "Cup A" } });
  const cupB = await prisma.tournament.create({ data: { ...t, slug: "b", name: "Cup B" } });
  const noId = await prisma.tournament.create({ data: { ...t, slug: "c", name: "No ID Cup", requireFreshInstitutionProof: false } });

  // ---------- saving
  ok("p3 has no institute: can't add an ID yet", err(await saveStudentId("p3", { path: "p3/a.jpg", expiresAt: null, noExpiry: true })) === "no_institute");
  ok("a path in someone else's folder is refused", err(await saveStudentId("p1", { path: "p2/a.jpg", expiresAt: null, noExpiry: true })) === "bad_path");
  ok("a path that tries to climb out is refused", err(await saveStudentId("p1", { path: "p1/../p2/a.jpg", expiresAt: null, noExpiry: true })) === "bad_path");
  ok("an expiry date or 'no expiry' is required", err(await saveStudentId("p1", { path: "p1/a.jpg", expiresAt: null, noExpiry: false })) === "expiry_required");
  ok("a made-up date is refused", err(await saveStudentId("p1", { path: "p1/a.jpg", expiresAt: "2027-02-30", noExpiry: false })) === "expiry_invalid");
  ok("an already-expired card is refused", err(await saveStudentId("p1", { path: "p1/a.jpg", expiresAt: day(-1), noExpiry: false })) === "expiry_in_past");
  ok("a card expiring today is accepted", !err(await saveStudentId("p4", { path: "p4/a.jpg", expiresAt: day(0), noExpiry: false })));
  ok("an absurd expiry (20 years) is refused", err(await saveStudentId("p1", { path: "p1/a.jpg", expiresAt: day(7300), noExpiry: false })) === "expiry_too_far");
  ok("a too-long student number is refused", err(await saveStudentId("p1", { path: "p1/a.jpg", expiresAt: day(400), noExpiry: false, studentId: "x".repeat(41) })) === "student_number_too_long");

  // ---------- nothing stored yet: the tournament asks for one
  const noIdBlock = await registerForTournament({ tournamentId: cupA.id, playerId: prof.p2 });
  ok("a tournament that asks for an ID blocks a player who hasn't added one", err(noIdBlock) === "institution_id_required");
  ok("...with a message that says what to do", (noIdBlock as { message?: string }).message?.includes("profile") === true);
  ok("a tournament that doesn't ask for one doesn't care", !err(await registerForTournament({ tournamentId: noId.id, playerId: prof.p2 })));

  // ---------- add once, reuse everywhere
  const saved = await saveStudentId("p1", { path: "p1/card.jpg", expiresAt: day(400), noExpiry: false, studentId: " 22L-1234 " });
  ok("p1 adds the ID once", "data" in saved && saved.data.previousPath === null);
  const st = await getStudentId("p1");
  ok("status, expiry and student number are stored", st?.status === "valid" && st.studentId === "22L-1234" && st.uploadedAt !== null && st.expiresAt?.toISOString().slice(0, 10) === day(400));
  ok("only the owner can ask for the photo path", (await getOwnStudentIdPath("p1")) === "p1/card.jpg" && (await getOwnStudentIdPath("p2")) === null);
  const a = await registerForTournament({ tournamentId: cupA.id, playerId: prof.p1 });
  const b = await registerForTournament({ tournamentId: cupB.id, playerId: prof.p1 });
  ok("the same stored ID is attached to the first tournament", !err(a) && "data" in a && a.data?.institutionProofPath === "p1/card.jpg");
  ok("...and to a second one, with no new upload", !err(b) && "data" in b && b.data?.institutionProofPath === "p1/card.jpg");

  // ---------- the host/organizer manual-add path never needs the player's ID
  ok("organizer manual-add works for a player with no stored ID", !err(await manualAddRegistration(cupA.id, org.id, "p2@x.com")));
  const manual = await prisma.registration.findFirst({ where: { tournamentId: cupA.id, playerId: prof.p2 } });
  ok("...and stores no photo (the organizer vouched)", manual?.institutionProofPath === null);

  // ---------- expiry: only a NEW ID is needed once it runs out
  await prisma.playerInstitution.update({ where: { playerId: prof.p1 }, data: { idExpiresAt: D(day(-3)) } });
  const cupC = await prisma.tournament.create({ data: { ...t, slug: "d", name: "Cup D" } });
  const expired = await registerForTournament({ tournamentId: cupC.id, playerId: prof.p1 });
  ok("an expired ID blocks new entries", err(expired) === "institution_id_expired");
  ok("...and the message says when it expired", (expired as { message?: string }).message?.includes(day(-3)) === true);
  ok("an entry made while it was valid stays valid", (await prisma.registration.count({ where: { playerId: prof.p1, status: "pending" } })) === 2);
  const renewed = await saveStudentId("p1", { path: "p1/new-card.jpg", expiresAt: day(900), noExpiry: false });
  ok("adding a new ID after expiry works", "data" in renewed);
  ok("the old photo is reported so the browser can delete it...", "data" in renewed && renewed.data.previousPath === "p1/card.jpg");
  ok("...but it's kept, because live entries still point at it", "data" in renewed && renewed.data.previousPathInUse === true);
  ok("entries now use the new ID", !err(await registerForTournament({ tournamentId: cupC.id, playerId: prof.p1 })) && (await prisma.registration.findFirst({ where: { tournamentId: cupC.id, playerId: prof.p1 } }))?.institutionProofPath === "p1/new-card.jpg");

  // ---------- switching institute makes the stored ID stale
  await prisma.registration.updateMany({ where: { playerId: prof.p1 }, data: { status: "rejected" } }); // free the lock for the test
  const sw = await setPlayerInstitution("p1", { institutionId: other.data.id, studentId: null, acknowledged: true });
  ok("p1 switches institute", !err(sw));
  const stale = await getStudentId("p1");
  ok("the ID added for the old institute is no longer usable", stale?.status === "other_institute");
  ok("...but it is still there for the player to remove or replace", (await getOwnStudentIdPath("p1")) === "p1/new-card.jpg");
  ok("a new institute needs a new ID", !err(await saveStudentId("p1", { path: "p1/lums-card.jpg", expiresAt: null, noExpiry: true })) && (await getStudentId("p1"))?.status === "valid");

  // ---------- removing: the player's choice, refused only while an entry still needs the photo
  await prisma.playerInstitution.update({ where: { playerId: prof.p1 }, data: { institutionId: fast.data.id, idInstitutionId: fast.data.id } });
  await prisma.registration.updateMany({ where: { playerId: prof.p1 }, data: { status: "rejected" } });
  const r1 = await registerForTournament({ tournamentId: (await prisma.tournament.create({ data: { ...t, slug: "e", name: "Cup E" } })).id, playerId: prof.p1 });
  ok("p1 enters another tournament with the stored ID", !err(r1));
  const blocked = await removeStudentId("p1");
  ok("removal is refused while a live entry uses the photo", err(blocked) === "in_use" && (blocked as { entries: number }).entries === 1);
  ok("...and the ID is untouched", (await getStudentId("p1"))?.status !== "none");
  if ("data" in r1 && r1.data) await rejectRegistration(r1.data.id, org.id);
  ok("once no live entry needs it, the player can remove it", (await liveEntriesUsingPhoto("p1/lums-card.jpg")) === 0);
  const gone = await removeStudentId("p1");
  ok("removal returns the path so the browser can delete the file", "data" in gone && gone.data.path === "p1/lums-card.jpg");
  const after = await prisma.playerInstitution.findUnique({ where: { playerId: prof.p1 } });
  ok("everything about the ID is cleared (photo, expiry, institute, student number)", after?.idImagePath === null && after.idExpiresAt === null && after.idInstitutionId === null && after.idUploadedAt === null && after.studentId === null);
  ok("...but their institute membership is untouched", after?.institutionId === fast.data.id);
  ok("removing again says there's nothing to remove", err(await removeStudentId("p1")) === "no_id");
  ok("after removal, tournaments that ask for an ID ask again", err(await registerForTournament({ tournamentId: (await prisma.tournament.create({ data: { ...t, slug: "f", name: "Cup F" } })).id, playerId: prof.p1 })) === "institution_id_required");

  // ---------- a stored ID alone does not pin the player the way a live entry does
  ok("p4 has an ID stored (from the checks above) but no entries", (await getStudentId("p4"))?.status === "expiring" && (await countActiveEntries(prof.p4, "p4")).total === 0);
  const move = await setPlayerInstitution("p4", { institutionId: other.data.id, studentId: null, acknowledged: true });
  ok("so p4 can still switch institute", !err(move) && (await getStudentId("p4"))?.status === "other_institute");
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
