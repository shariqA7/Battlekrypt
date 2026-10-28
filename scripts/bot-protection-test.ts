// The public sign-up routes: do they really demand the human check, and does the shared limiter
// cut off a flood? Cloudflare's answers are faked. Needs a migrated, empty Postgres (npm test).
import { prisma } from "../lib/prisma";
import { POST as signup } from "../app/api/auth/signup/route";
import { POST as orgSignup } from "../app/api/auth/org-signup/route";
import { POST as forgot } from "../app/api/auth/forgot-password/route";
import { POST as resend } from "../app/api/auth/resend/route";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const TOKEN = "0.FakeTokenFromTheBrowser-1234567890";
let cloudflareSays: unknown = { success: true };
let cloudflareCalls = 0;
globalThis.fetch = (async (url: string) => {
  if (String(url).includes("challenges.cloudflare.com")) {
    cloudflareCalls++;
    return { ok: true, status: 200, json: async () => cloudflareSays } as Response;
  }
  throw new Error(`unexpected network call to ${url}`);
}) as typeof fetch;

let n = 0;
// Each request gets its own (still invalid) email: forgot-password and resend also limit per email.
const post = (handler: (r: Request) => Promise<Response>, body: object, ip = `203.0.113.${++n}`) => {
  const withEmail = "email" in body ? { ...body, email: `${(body as { email: string }).email}${++n}` } : body;
  return handler(new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(withEmail) }));
};
const checkIds = async (r: Response) => ((await r.json()).checks ?? []).filter((c: { ok: boolean }) => !c.ok).map((c: { id: string }) => c.id);

const routes: [string, (r: Request) => Promise<Response>, object][] = [
  ["sign up", signup, { email: "not-an-email" }],
  ["organizer sign up", orgSignup, { email: "not-an-email" }],
  ["forgot password", forgot, { email: "not-an-email" }],
  ["resend confirmation", resend, { email: "not-an-email" }],
];

async function main() {
  const realError = console.error;
  console.error = () => undefined;

  // ---- the check is OFF when no secret is configured (development, CI)
  delete process.env.TURNSTILE_SECRET_KEY;
  for (const [name, h, body] of routes) {
    const ids = await checkIds(await post(h, body));
    ok(`${name}: with the check switched off, a request without a token is not stopped by it`, !ids.includes("captcha"));
  }
  ok("(and Cloudflare was never contacted)", cloudflareCalls === 0);

  // ---- ON: no token, refused before anything else happens
  process.env.TURNSTILE_SECRET_KEY = "secret";
  for (const [name, h, body] of routes) {
    const res = await post(h, body);
    const ids = await checkIds(res);
    ok(`${name}: no token -> 400 with a "human check" message`, res.status === 400 && ids.join() === "captcha");
  }
  ok("no token means Cloudflare isn't even asked", cloudflareCalls === 0);

  // ---- ON: token that Cloudflare rejects
  cloudflareSays = { success: false, "error-codes": ["invalid-input-response"] };
  for (const [name, h, body] of routes) {
    const res = await post(h, { ...body, captchaToken: TOKEN });
    ok(`${name}: a token Cloudflare rejects -> 400`, res.status === 400 && (await checkIds(res)).join() === "captcha");
  }

  // ---- ON: good token, the request proceeds to its normal checks (and fails those instead)
  cloudflareSays = { success: true };
  for (const [name, h, body] of routes) {
    const res = await post(h, { ...body, captchaToken: TOKEN });
    const ids = await checkIds(res);
    ok(`${name}: a good token gets past the gate, on to the normal validation`, res.status === 400 && !ids.includes("captcha") && ids.length > 0);
  }
  ok("each good request was verified with Cloudflare", cloudflareCalls >= 8);

  // ---- the shared limiter stops a flood (sign up allows 8 per hour per address)
  const ip = "198.51.100.77";
  const codes: number[] = [];
  for (let i = 0; i < 10; i++) codes.push((await post(signup, { email: "x", captchaToken: TOKEN }, ip)).status);
  ok("the first 8 sign-up attempts from one address are processed", codes.slice(0, 8).every((c) => c === 400));
  ok("the 9th and 10th are stopped with 429", codes[8] === 429 && codes[9] === 429);
  const flooded = await post(signup, { email: "x", captchaToken: TOKEN }, ip);
  ok("the 429 says how long to wait", (await flooded.json()).checks?.[0]?.id === "rate_limit");
  ok("a different address is unaffected", (await post(signup, { email: "x", captchaToken: TOKEN }, "198.51.100.78")).status === 400);
  ok("the flooding address is stopped BEFORE Cloudflare is asked (saves the lookup)", await (async () => { const before = cloudflareCalls; await post(signup, { email: "x", captchaToken: TOKEN }, ip); return cloudflareCalls === before; })());

  console.error = realError;
}
main().catch((e) => { console.error(e); fails++; }).finally(async () => { await prisma.$disconnect(); console.log(fails ? `\n${fails} FAILED` : "\nAll passed"); process.exit(fails ? 1 : 0); });
