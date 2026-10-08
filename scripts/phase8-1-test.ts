// Institutes + player membership (one institute per player, 7-day change lock).
// Needs a Postgres with all migrations applied. Run (path alias "@/" is resolved by alias.js):
//   DATABASE_URL=... npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' -r ./alias.js scripts/phase8-1-test.ts
import { prisma } from "../lib/prisma";
import {
  createInstitution, setInstitutionVerified, listVerifiedInstitutions, institutionCounts,
  setPlayerInstitution, getInstitutionForUser, institutionChangeUnlocksAt, INSTITUTE_CHANGE_DAYS,
} from "../lib/services/institutions";
import { validateInstitution } from "../lib/validation/institution";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const err = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const DAY = 24 * 60 * 60 * 1000;

async function main() {
  await prisma.user.createMany({ data: [
    { id: "adm", email: "a@x.com", displayName: "Admin", isAdmin: true },
    { id: "o1", email: "o1@x.com", displayName: "Org1" },
    { id: "o2", email: "o2@x.com", displayName: "Org2" },
    { id: "o3", email: "o3@x.com", displayName: "Org3" },
    { id: "p1", email: "p1@x.com", displayName: "P1" },
    { id: "p2", email: "p2@x.com", displayName: "P2" },
  ]});
  const [org1, org2, org3] = await Promise.all(["o1", "o2", "o3"].map((u) =>
    prisma.organizerProfile.create({ data: { userId: u, orgName: `Org ${u}` } })));
  const prof = await prisma.playerProfile.create({ data: { userId: "p1", firstName: "P", lastName: "One" } });

  // validation
  ok("validation: institute required", "errors" in validateInstitution({ institutionId: "" }));
  const v = validateInstitution({ institutionId: " abc ", studentId: "", acknowledged: true });
  ok("validation: trims, empty studentId -> null, ack kept", "data" in v && v.data.institutionId === "abc" && v.data.studentId === null && v.data.acknowledged === true);
  ok("validation: ack defaults to false", "data" in validateInstitution({ institutionId: "a" }) && (validateInstitution({ institutionId: "a" }) as { data: { acknowledged: boolean } }).data.acknowledged === false);

  // creating institutes
  ok("short name rejected", err(await createInstitution(org1.id, "x")) === "invalid_name");
  const fast = await createInstitution(org1.id, "  FAST   University ");
  ok("create ok, name normalised", "data" in fast && (await prisma.institution.findUnique({ where: { id: fast.data.id } }))?.name === "FAST University");
  ok("one institute per organization", err(await createInstitution(org1.id, "Other")) === "already_has_institution");
  ok("name unique, case-insensitive", err(await createInstitution(org2.id, "fast university")) === "name_taken");
  const comsats = await createInstitution(org2.id, "COMSATS University");
  const lums = await createInstitution(org3.id, "LUMS");
  if (!("data" in fast) || !("data" in comsats) || !("data" in lums)) return;

  // verification (admin, once)
  ok("unverified institutes are not listed", (await listVerifiedInstitutions()).length === 0);
  ok("player cannot pick an unverified institute", err(await setPlayerInstitution("p1", { institutionId: fast.data.id, studentId: null, acknowledged: false })) === "institution_not_found");
  ok("verify ok", "data" in await setInstitutionVerified(fast.data.id, "adm", true));
  ok("verify twice rejected", err(await setInstitutionVerified(fast.data.id, "adm", true)) === "already_verified");
  await setInstitutionVerified(comsats.data.id, "adm", true);
  await setInstitutionVerified(lums.data.id, "adm", true);
  ok("revoke needs a note", err(await setInstitutionVerified(lums.data.id, "adm", false, "  ")) === "note_required");
  ok("revoke ok", "data" in await setInstitutionVerified(lums.data.id, "adm", false, "Not a real institute"));
  ok("listing shows only verified, filter works", (await listVerifiedInstitutions()).length === 2 && (await listVerifiedInstitutions("comsats")).length === 1);
  const logs = await prisma.adminActionLog.findMany({ where: { targetType: "Institution" } });
  ok("audit log written", logs.map((l) => l.action).sort().join() === "institution_unverified,institution_verified,institution_verified,institution_verified");
  const c = await institutionCounts();
  ok("counts", c.pending === 1 && c.verified === 2);

  // membership
  ok("no profile -> error", err(await setPlayerInstitution("p2", { institutionId: fast.data.id, studentId: null, acknowledged: false })) === "no_player_profile");
  const t0 = new Date("2026-10-01T10:00:00Z");
  const first = await setPlayerInstitution("p1", { institutionId: fast.data.id, studentId: "22L-1234", acknowledged: false }, t0);
  ok("first pick needs no confirmation", "data" in first);
  const m1 = await getInstitutionForUser("p1");
  ok("membership stored with snapshot name", m1?.institutionId === fast.data.id && m1.institutionName === "FAST University" && m1.studentId === "22L-1234");
  ok("only one membership row per player", (await prisma.playerInstitution.count()) === 1);
  ok("unlock date is 7 days out", INSTITUTE_CHANGE_DAYS === 7 && institutionChangeUnlocksAt(t0).getTime() === t0.getTime() + 7 * DAY);

  const same = await setPlayerInstitution("p1", { institutionId: fast.data.id, studentId: "NEW-1", acknowledged: false }, new Date(t0.getTime() + DAY));
  const m1b = await getInstitutionForUser("p1");
  ok("same institute: only student id changes, lock not reset", "data" in same && m1b?.studentId === "NEW-1" && m1b.lastChangedAt.getTime() === t0.getTime());

  const early = await setPlayerInstitution("p1", { institutionId: comsats.data.id, studentId: null, acknowledged: true }, new Date(t0.getTime() + 6 * DAY));
  ok("change inside 7 days is locked (even if acknowledged)", err(early) === "change_locked" && "unlocksAt" in early && early.unlocksAt.getTime() === t0.getTime() + 7 * DAY);
  const noAck = await setPlayerInstitution("p1", { institutionId: comsats.data.id, studentId: null, acknowledged: false }, new Date(t0.getTime() + 8 * DAY));
  ok("after a week, change needs the warning acknowledged", err(noAck) === "confirmation_required");
  ok("still on the old institute", (await getInstitutionForUser("p1"))?.institutionId === fast.data.id);
  const t1 = new Date(t0.getTime() + 8 * DAY);
  const changed = await setPlayerInstitution("p1", { institutionId: comsats.data.id, studentId: null, acknowledged: true }, t1);
  const m2 = await getInstitutionForUser("p1");
  ok("acknowledged change ok, restarts the lock", "data" in changed && m2?.institutionId === comsats.data.id && m2.institutionName === "COMSATS University" && m2.lastChangedAt.getTime() === t1.getTime());
  ok("immediately locked again", err(await setPlayerInstitution("p1", { institutionId: fast.data.id, studentId: null, acknowledged: true }, new Date(t1.getTime() + DAY))) === "change_locked");

  // legacy rows (free text, never linked) can pick an institute freely
  const p2 = await prisma.playerProfile.create({ data: { userId: "p2", firstName: "P", lastName: "Two" } });
  await prisma.playerInstitution.create({ data: { playerId: p2.id, institutionName: "Some College", idImagePath: "p2/id.jpg" } });
  const legacy = await setPlayerInstitution("p2", { institutionId: fast.data.id, studentId: null, acknowledged: false });
  ok("legacy free-text row: first real pick needs no wait or confirmation", "data" in legacy && (await getInstitutionForUser("p2"))?.institutionId === fast.data.id);
  void prof;
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
