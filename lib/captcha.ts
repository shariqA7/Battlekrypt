// Server side of the "are you human" check (Cloudflare Turnstile).
//
// Turned on by setting TURNSTILE_SECRET_KEY (and NEXT_PUBLIC_TURNSTILE_SITE_KEY for the widget).
// With no secret it is OFF and every check passes, so local development and CI need no keys.
// Cloudflare publishes always-pass test keys for trying it out; see docs/security.md.
import type { Check } from "@/lib/validation/auth";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const captchaEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

export type CaptchaResult = { ok: true } | { ok: false; reason: "missing" | "invalid" };

type FetchLike = (url: string, init: { method: string; body: URLSearchParams; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function verifyCaptcha(token: unknown, ip: string, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true }; // not configured: off
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return { ok: false, reason: "missing" };

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    // Cloudflare itself is down or erroring: let people through rather than block every sign-up.
    // The rate limiter still applies.
    if (!res.ok) {
      console.error(`captcha: Cloudflare answered ${res.status}, letting the request through`);
      return { ok: true };
    }
    const data = (await res.json()) as { success?: boolean };
    return data.success === true ? { ok: true } : { ok: false, reason: "invalid" };
  } catch (error) {
    console.error("captcha: could not reach Cloudflare, letting the request through", error);
    return { ok: true };
  }
}

export function captchaCheck(result: Extract<CaptchaResult, { ok: false }>): Check {
  return {
    id: "captcha",
    ok: false,
    message:
      result.reason === "missing"
        ? "Please complete the human check"
        : "The human check didn't pass. Please try again",
  };
}
