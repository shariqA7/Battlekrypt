// Needs a Postgres with all migrations applied. Run (path alias "@/" is resolved by a tiny preload):
//   DATABASE_URL=... npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' -r ./alias.js scripts/phase8-1-test.ts
import { prisma } from "../lib/prisma";
import {
  submitInstitution, reviewInstitution, isPlayerInstitutionVerified, getInstitutionForUser, institutionCounts,
} from "../lib/services/institutions";
import { validateInstitution } from "../lib/validation/institution";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };

async function main() {
  await prisma.user.createMany({ data: [
    { id: "u1", email: "p@x.com", displayName: "P" },
    { id: "adm", email: "a@x.com", displayName: "A", isAdmin: true },
    { id: "u2", email: "q@x.com", displayName: "Q" },
  ]});
  const prof = await prisma.playerProfile.create({ data: { userId: "u1", firstName: "P", lastName: "One" } });

  // validation
  ok("rejects path in someone else's folder", "errors" in validateInstitution({ institutionName: "LUMS", idImagePath: "u2/a.jpg" }, "u1"));
  ok("rejects path traversal", "errors" in validateInstitution({ institutionName: "LUMS", idImagePath: "u1/../u2/a.jpg" }, "u1"));
  ok("rejects short name", "errors" in validateInstitution({ institutionName: "L", idImagePath: "u1/a.jpg" }, "u1"));
  const v = validateInstitution({ institutionName: " LUMS ", studentId: "", idImagePath: "u1/a.jpg" }, "u1");
  ok("accepts valid + trims + empty studentId -> null", "data" in v && v.data.institutionName === "LUMS" && v.data.studentId === null);
  if (!("data" in v)) return;

  ok("no profile -> error", "error" in await submitInstitution("u2", v.data));
  const s1 = await submitInstitution("u1", v.data);
  ok("first submit ok", "data" in s1);
  ok("pending is not verified", !(await isPlayerInstitutionVerified(prof.id)));
  const s2 = await submitInstitution("u1", { ...v.data, institutionName: "LUMS Lahore" });
  ok("edit while pending keeps one row", "data" in s2 && (await prisma.playerInstitution.count()) === 1);

  const id = (await getInstitutionForUser("u1"))!.id;
  ok("reject needs a note", "error" in await reviewInstitution(id, "adm", "reject", "  "));
  ok("reject with note ok", "data" in await reviewInstitution(id, "adm", "reject", "ID photo is blurry"));
  ok("cannot review twice", "error" in await reviewInstitution(id, "adm", "approve"));
  const row = await getInstitutionForUser("u1");
  ok("rejected shows note", row?.status === "rejected" && row.adminNote === "ID photo is blurry");

  const s3 = await submitInstitution("u1", v.data);
  const row2 = await getInstitutionForUser("u1");
  ok("resubmit resets to pending and clears note", "data" in s3 && row2?.status === "pending" && row2.adminNote === null && row2.reviewedAt === null);
  ok("approve ok", "data" in await reviewInstitution(id, "adm", "approve"));
  ok("approved is verified", await isPlayerInstitutionVerified(prof.id));
  ok("approved cannot be resubmitted", "error" in await submitInstitution("u1", v.data));
  const logs = await prisma.adminActionLog.findMany({ where: { targetId: id } });
  ok("audit log has reject + approve", logs.map((l) => l.action).sort().join() === "institution_approved,institution_rejected");
  const c = await institutionCounts();
  ok("counts", c.approved === 1 && c.pending === 0 && c.rejected === 0);
}

main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); process.exit(fails ? 1 : 0); });
