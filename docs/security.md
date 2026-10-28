# Bot protection and rate limiting

Two things protect the public sign-up and sign-in routes from scripts: a **human check** (Cloudflare
Turnstile) and a **shared rate limiter** (counts kept in your Postgres).

## 1. The human check (Cloudflare Turnstile)

Turnstile is free, usually invisible (no picture puzzles), and works well in Pakistan.
It is **off until you set keys**, so development and CI need nothing.

1. In the Cloudflare dashboard open **Turnstile**, **Add widget**. Add your domain (and `localhost` if you
   want to try it locally). Widget mode **Managed** is a good default.
2. Copy the **Site Key** and **Secret Key** into your environment (Vercel project settings, or `.env.local`):

   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key>
   TURNSTILE_SECRET_KEY=<secret key>
   ```
3. Redeploy. The box now appears on **sign up**, **organizer sign up**, **forgot password** and the
   **resend confirmation** button, and the server refuses those requests without a valid token.

Trying it before you go live: Cloudflare publishes test keys that always pass
(site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`). If these ever stop
working, look for "testing" in Cloudflare's Turnstile documentation.

How it behaves:
- The browser gets a one-time token; the **server** verifies it with Cloudflare (`lib/captcha.ts`). A form that
  skips the box, or sends a made-up token, is refused with a plain message.
- If Cloudflare itself is down or unreachable, requests are **let through** (and logged) instead of blocking every
  sign-up. The rate limiter below still applies.
- Login is **not** behind the box (it would annoy real players). It is protected by the limiter instead:
  8 tries per account and 30 per address every 15 minutes.

## 2. The shared rate limiter

Counts are stored in the `RateLimitBucket` table, so every server instance sees the same numbers. (The old
in-memory counter only stopped a script *per server*, and a serverless host can run dozens.)

| Route | Limit |
| --- | --- |
| Sign up, organizer sign up | 8 per hour per address |
| Login | 8 per 15 min per account, 30 per 15 min per address |
| Forgot password, resend confirmation | 10 per hour per address, 3 per hour per email |
| Confirm link | 20 per 15 min per address |
| Reset password | 10 per hour per address |
| Onboarding saves | 60 per hour per signed-in user |
| Guardian manage page, payout details | 20 per hour per address |

Details worth knowing:
- It is a *sliding* window (two windows blended), so someone can't send the full allowance at the end of one
  window and again at the start of the next.
- Emails and addresses are stored **hashed**, never in the clear, and old rows delete themselves.
- If the database can't be reached the limiter falls back to counting in memory and logs the problem, so a
  database hiccup never locks everyone out of logging in.
- Behind a proxy or CDN the address comes from `x-forwarded-for`. Vercel sets this for you; if you run your own
  proxy, make sure it overwrites that header rather than passing along one sent by the visitor.

## Tests

`npx tsx scripts/captcha-test.ts`, `scripts/rate-limit-test.ts` and `scripts/bot-protection-test.ts`
(the last two need the throwaway Postgres; `npm test` runs all of them, see `docs/CI.md`).
