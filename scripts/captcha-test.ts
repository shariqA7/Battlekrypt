// The "are you human" server check, with Cloudflare's answers faked. No database or network needed.
import { captchaCheck, captchaEnabled, verifyCaptcha } from "../lib/captcha";

let fails = 0;
const ok = (n: string, c: boolean) => { console.log(`${c ? "PASS" : "FAIL"} ${n}`); if (!c) fails++; };

const TOKEN = "0.AbCdEfGhIjKlMnOpQrStUv-123456789";
type Call = { url: string; body: URLSearchParams };
const fake = (reply: { ok?: boolean; status?: number; json?: unknown } | Error, calls: Call[] = []) =>
  async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, body: init.body });
    if (reply instanceof Error) throw reply;
    return { ok: reply.ok ?? true, status: reply.status ?? 200, json: async () => reply.json ?? { success: true } };
  };

async function main() {
  const realError = console.error;
  console.error = () => undefined;

  delete process.env.TURNSTILE_SECRET_KEY;
  ok("off when no secret is set", !captchaEnabled());
  ok("so everything passes (dev and CI need no keys)", (await verifyCaptcha(undefined, "1.2.3.4")).ok);

  process.env.TURNSTILE_SECRET_KEY = "secret-key";
  ok("on when a secret is set", captchaEnabled());
  for (const bad of [undefined, null, "", "short", 12345, {}, "x".repeat(5000)]) {
    const r = await verifyCaptcha(bad, "1.2.3.4", fake({ json: { success: true } }));
    if (r.ok || r.reason !== "missing") { ok(`a missing or bad token is refused (${JSON.stringify(bad)?.slice(0, 20)})`, false); }
  }
  ok("missing, short, wrong-type and oversized tokens are all refused", true);

  const calls: Call[] = [];
  ok("a good answer from Cloudflare passes", (await verifyCaptcha(TOKEN, "1.2.3.4", fake({ json: { success: true } }, calls))).ok);
  ok("it asks Cloudflare's siteverify endpoint", calls[0].url === "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  ok("it sends the secret, the token and the visitor's IP", calls[0].body.get("secret") === "secret-key" && calls[0].body.get("response") === TOKEN && calls[0].body.get("remoteip") === "1.2.3.4");
  const c2: Call[] = [];
  await verifyCaptcha(TOKEN, "unknown", fake({}, c2));
  ok("it leaves the IP out when it isn't known", c2[0].body.get("remoteip") === null);

  const bad = await verifyCaptcha(TOKEN, "1.2.3.4", fake({ json: { success: false, "error-codes": ["invalid-input-response"] } }));
  ok("a rejected token is refused as invalid", !bad.ok && bad.reason === "invalid");
  ok("a reply without success:true is refused", !(await verifyCaptcha(TOKEN, "1.2.3.4", fake({ json: {} }))).ok && !(await verifyCaptcha(TOKEN, "1.2.3.4", fake({ json: { success: "true" } }))).ok);

  ok("if Cloudflare errors (500), people aren't locked out", (await verifyCaptcha(TOKEN, "1.2.3.4", fake({ ok: false, status: 500 }))).ok);
  ok("if Cloudflare is unreachable, people aren't locked out", (await verifyCaptcha(TOKEN, "1.2.3.4", fake(new Error("network down")))).ok);

  ok("the message for a missing token asks them to complete the check", captchaCheck({ ok: false, reason: "missing" }).message === "Please complete the human check");
  ok("the message for a bad token says it didn't pass", /didn't pass/.test(captchaCheck({ ok: false, reason: "invalid" }).message));
  ok("it reports as a failed check with an id the forms can use", captchaCheck({ ok: false, reason: "invalid" }).id === "captcha" && captchaCheck({ ok: false, reason: "invalid" }).ok === false);

  console.error = realError;
}
main().catch((e) => { console.error(e); fails++; }).finally(() => { console.log(fails ? `\n${fails} FAILED` : "\nAll passed"); process.exit(fails ? 1 : 0); });
