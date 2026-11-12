// Site feedback: the rules (kinds, length, email, page path), sending as a visitor and as a
// signed-in user, the admin list and filters, status changes and who gets notified, deleting,
// and what account deletion does to a sender's messages.
// Needs a Postgres with all migrations applied (see phase8-1-test.ts).
import { prisma } from "../lib/prisma";
import { eraseUser, type ErasureDeps } from "../lib/services/account-deletion";
import {
  submitFeedback, listFeedbackForAdmin, countFeedbackByStatus, countOpenFeedback, updateFeedback, deleteFeedback,
} from "../lib/services/feedback";
import { validateFeedback, cleanPagePath, FEEDBACK_MESSAGE_MAX } from "../lib/feedback-rules";
import { hasAccess, ROLE_TEMPLATES, STAFF_PERMISSION_KEYS } from "../lib/staff-permissions";

let fails = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"} ${name}`); if (!cond) fails++; };
const code = (r: unknown) => (r && typeof r === "object" && "error" in r ? (r as { error: string }).error : null);
const id = (r: unknown) => (r as { data: { id: string } }).data.id;
const msg = "The bracket page is hard to read on my phone.";

async function main() {
  // ---- the rules (no database) ----
  ok("rules: a good message passes", validateFeedback({ kind: "feature", message: msg }).ok);
  ok("rules: unknown kind refused", !validateFeedback({ kind: "praise", message: msg }).ok);
  ok("rules: missing kind refused", !validateFeedback({ message: msg }).ok);
  ok("rules: too short refused", !validateFeedback({ kind: "issue", message: "too short" }).ok);
  ok("rules: only spaces refused", !validateFeedback({ kind: "issue", message: "                    " }).ok);
  ok("rules: too long refused", !validateFeedback({ kind: "issue", message: "x".repeat(FEEDBACK_MESSAGE_MAX + 1) }).ok);
  ok("rules: exactly the maximum passes", validateFeedback({ kind: "issue", message: "x".repeat(FEEDBACK_MESSAGE_MAX) }).ok);
  ok("rules: not a string refused", !validateFeedback({ kind: "issue", message: 12345678901 }).ok);
  ok("rules: bad email refused", !validateFeedback({ kind: "other", message: msg, email: "not-an-email" }).ok);
  const withEmail = validateFeedback({ kind: "other", message: `  ${msg}  `, email: "  Fan@Example.COM " });
  ok("rules: email is cleaned and the message trimmed", withEmail.ok && withEmail.value.contactEmail === "fan@example.com" && withEmail.value.message === msg);
  ok("rules: no email is allowed", validateFeedback({ kind: "other", message: msg }).ok);
  ok("page path: query string and fragment are dropped", cleanPagePath("/reset-password?token=secret#x") === "/reset-password");
  ok("page path: a normal path is kept", cleanPagePath("/tournaments/abc") === "/tournaments/abc");
  ok("page path: another site is refused", cleanPagePath("https://evil.example/x") === null && cleanPagePath("//evil.example") === null);
  ok("page path: junk refused", cleanPagePath(null) === null && cleanPagePath(42) === null && cleanPagePath("/" + "a".repeat(400)) === null);

  // ---- staff permission ----
  ok("permission: feedback is a staff permission", STAFF_PERMISSION_KEYS.includes("feedback" as never));
  ok("permission: admin template can edit feedback", ROLE_TEMPLATES.admin.feedback === "edit");
  const noAccess = { userId: "s", role: "manager" as const, grants: { users: "view" as const } };
  ok("permission: staff without it cannot open feedback", !hasAccess(noAccess, "feedback"));

  // ---- sending ----
  await prisma.user.createMany({ data: ["adm", "u1", "u2"].map((u) => ({ id: u, email: `${u}@x.com`, displayName: `Name ${u}`, isAdmin: u === "adm" })) });
  const before = await prisma.feedback.count();
  ok("send: bad input is refused and saves nothing", code(await submitFeedback({ userId: null, kind: "feature", message: "short" })) === "validation_error" && (await prisma.feedback.count()) === before);
  const v = await submitFeedback({ userId: null, kind: "feature", message: msg, email: "visitor@x.com", pageUrl: "/tournaments?secret=1" });
  const vRow = await prisma.feedback.findUnique({ where: { id: id(v) } });
  ok("send: a visitor's message is saved as new, with no account", vRow?.status === "open" && vRow.userId === null && vRow.contactEmail === "visitor@x.com");
  ok("send: the page is saved without its query string", vRow?.pageUrl === "/tournaments");
  const a = await submitFeedback({ userId: "u1", kind: "issue", message: "The Join button does nothing on the tournament page." });
  const b = await submitFeedback({ userId: "u2", kind: "other", message: "Please add a Spanish version of the site." });
  const aRow = await prisma.feedback.findUnique({ where: { id: id(a) } });
  ok("send: a signed-in message is linked to the account", aRow?.userId === "u1" && aRow.contactEmail === null);

  // ---- the admin list ----
  ok("list: everything, newest first", (await listFeedbackForAdmin()).length === 3);
  ok("list: filter by kind", (await listFeedbackForAdmin({ kind: "issue" })).map((r) => r.id).join() === id(a));
  ok("list: filter by status", (await listFeedbackForAdmin({ status: "done" })).length === 0 && (await listFeedbackForAdmin({ status: "open" })).length === 3);
  ok("list: an unknown filter is ignored, not an error", (await listFeedbackForAdmin({ status: "bogus", kind: "bogus" })).length === 3);
  const rows = await listFeedbackForAdmin();
  const visitorRow = rows.find((r) => r.id === id(v));
  const userRow = rows.find((r) => r.id === id(a));
  ok("list: shows who sent it", visitorRow?.sender === "Visitor" && visitorRow.senderEmail === "visitor@x.com" && userRow?.sender === "Name u1" && userRow.senderEmail === "u1@x.com");
  ok("count: open feedback", (await countOpenFeedback()) === 3 && (await countFeedbackByStatus()).open === 3);

  // ---- status, notes, notifications ----
  ok("update: unknown id", code(await updateFeedback({ adminId: "adm", id: "nope", status: "done" })) === "not_found");
  ok("update: unknown status refused", code(await updateFeedback({ adminId: "adm", id: id(a), status: "maybe" })) === "validation_error");
  ok("update: nothing to change refused", code(await updateFeedback({ adminId: "adm", id: id(a) })) === "validation_error");
  ok("update: too long a note refused", code(await updateFeedback({ adminId: "adm", id: id(a), adminNote: "x".repeat(1001) })) === "validation_error");
  const nCount = () => prisma.notification.count({ where: { type: "feedback" } });
  await updateFeedback({ adminId: "adm", id: id(a), status: "reviewing" });
  ok("update: 'looking into it' does not notify", (await nCount()) === 0);
  const done = await updateFeedback({ adminId: "adm", id: id(a), status: "done", adminNote: "Fixed in today's release." });
  const after = await prisma.feedback.findUnique({ where: { id: id(a) } });
  ok("update: status, note and who handled it are saved", !code(done) && after?.status === "done" && after.adminNote === "Fixed in today's release." && after.handledById === "adm" && !!after.handledAt);
  const notes = await prisma.notification.findMany({ where: { type: "feedback" } });
  ok("update: a signed-in sender is told when it is decided", notes.length === 1 && notes[0].userId === "u1" && notes[0].body === "Fixed in today's release.");
  await updateFeedback({ adminId: "adm", id: id(a), status: "done", adminNote: "Edited note." });
  ok("update: saving the same status again does not notify twice", (await nCount()) === 1);
  await updateFeedback({ adminId: "adm", id: id(v), status: "planned" });
  ok("update: a visitor has no account, so nobody is notified", (await nCount()) === 1);
  await updateFeedback({ adminId: "adm", id: id(a), adminNote: "" });
  ok("update: an empty note clears it", (await prisma.feedback.findUnique({ where: { id: id(a) } }))?.adminNote === null);
  ok("count: by status after changes", (await countOpenFeedback()) === 1);

  // ---- deleting ----
  ok("delete: removes it", !code(await deleteFeedback(id(v))) && (await prisma.feedback.count({ where: { id: id(v) } })) === 0);
  ok("delete: unknown id", code(await deleteFeedback(id(v))) === "not_found");

  // ---- account deletion unlinks the sender ----
  const deps: ErasureDeps = { listFolder: async () => [], removeFiles: async () => undefined, deleteAuthUser: async () => undefined };
  await submitFeedback({ userId: "u2", kind: "issue", message: "Second message from the same person.", email: "u2-reply@x.com" });
  await eraseUser("u2", deps);
  const left = await prisma.feedback.findMany({ where: { id: { in: [id(b)] } } });
  const second = await prisma.feedback.findMany({ where: { message: "Second message from the same person." } });
  ok("erase: the messages stay", left.length === 1 && second.length === 1);
  ok("erase: but are no longer tied to the person or their email", [...left, ...second].every((f) => f.userId === null && f.contactEmail === null));
  ok("erase: an admin still sees them, as a visitor", (await listFeedbackForAdmin()).filter((r) => r.id === id(b)).every((r) => r.sender === "Visitor"));

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
