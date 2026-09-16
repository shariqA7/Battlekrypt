# BattleKrypt — Setup Instructions

This project was scaffolded with Next.js 16 (App Router, TypeScript, Tailwind v4).
Two things failed to run in the sandbox that built this **only due to network
restrictions there** — both will work immediately on your machine or in CI.

## 1. Install dependencies
```
npm install
```

## 2. Environment variables
Copy `.env.local.example` to `.env.local` and fill in real values from:
- Supabase project settings (DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, keys)
- Google Cloud Console (OAuth client for Google login)
- Discord Developer Portal (OAuth client for Discord login)

## 3. Generate the Prisma client
This step needs real internet access to download Prisma's query engine binaries
(blocked in the sandbox that built this scaffold):
```
npx prisma generate
npx prisma migrate dev --name init
```

## 4. Run the dev server
```
npm run dev
```
Fonts (Hanken Grotesk, JetBrains Mono) load from Google Fonts automatically via
`next/font/google` — this needs internet access too, which your local machine
and Vercel both have, unlike the sandbox that built this.

## What's already wired up
- `app/globals.css` — real BattleKrypt design tokens (colors, gold gradient) as
  Tailwind v4 `@theme` values — use classes like `bg-bk-surface`, `text-bk-heading`,
  `text-bk-gold-light`, `border-bk-border`
- `app/layout.tsx` — Hanken Grotesk + JetBrains Mono self-hosted via next/font
- `components/layout/Nav.tsx` — real nav with Donate added
- `components/ui/` — AuthModal, VerifiedBadge, CurrencyInput, ClubGameRatings
- `prisma/schema.prisma` — full data model (all 9 phases; Phase 1 tables are the
  ones to actually migrate first — see esports-platform-spec.md for scope)

## Next steps
Build out the route groups already scaffolded under `app/`:
- `(auth)` — login/signup pages using AuthModal
- `(public)/tournaments` — browse + detail pages
- `(player)/dashboard` — "My Matches"
- `(organizer)/dashboard` — tournament management
- `(admin)/admin` — approval queues

Match these against `api-contract-phase1.md` for the API routes each page needs.

## Auth is now real (Supabase, Google + Discord)

- `lib/supabase/client.ts` / `lib/supabase/server.ts` — browser and server Supabase clients
- `proxy.ts` (Next.js 16's replacement for middleware.ts) — refreshes sessions on every request, redirects unauthenticated users away from `/dashboard` and `/admin` to `/login?redirectTo=<original path>`
- `app/auth/callback/route.ts` — exchanges the OAuth/magic-link code for a session, honors `redirectTo`
- `app/(auth)/login/page.tsx` — real login page, wires AuthModal's Google/Discord buttons to `supabase.auth.signInWithOAuth`, email to `signInWithOtp` (magic link)

### To make Google/Discord login actually work
1. In Supabase Dashboard → Authentication → Providers, enable Google and Discord
2. Create OAuth apps in Google Cloud Console and Discord Developer Portal, add their client ID/secret into Supabase's provider settings (not your own .env — Supabase holds these)
3. Set the OAuth redirect URI in both consoles to: `https://[YOUR_SUPABASE_PROJECT].supabase.co/auth/v1/callback`

This was verified to build cleanly (TypeScript, routing, Suspense boundaries all correct) using placeholder Supabase credentials — connect a real project and it works immediately.

## Tournament browse/detail — real service-backed pages

- `lib/services/tournaments.ts` — shared logic (list, detail, create, publish).
  Both the API routes below AND the web pages call this directly — the web
  app doesn't fetch its own API over HTTP, but mobile/external clients get
  the identical contract through the routes.
- `app/api/tournaments/route.ts` — GET (browse/filter/search) + POST (organizer create)
- `app/api/tournaments/[id]/route.ts` — GET detail
- `app/api/tournaments/[id]/publish/route.ts` — POST, enforces the organizer-approval
  gate (checks `User.kycStatus === "approved"` before allowing publish)
- `app/(public)/tournaments/page.tsx` — real browse page, server-rendered
- `app/(public)/tournaments/[id]/page.tsx` — real detail page, server-rendered

### Important — this could not be verified in the sandbox that built it
`npx prisma generate` needs to download engine binaries from `binaries.prisma.sh`,
which this sandbox cannot reach (network allowlist only permits npm/GitHub).
This means:
1. `@prisma/client` has no generated types right now — TypeScript will show
   errors on any file importing it until you run `npx prisma generate` locally.
2. The build could not be fully verified end-to-end here.

**First thing to do after extracting this**: run `npx prisma generate` (needs
a real internet connection, works fine outside this sandbox), then
`npm run build` to confirm everything compiles before continuing.

## Schema — trimmed to Phase 1

`prisma/schema.prisma` now contains **only Phase 1 tables** (User, Game,
GameRequest, PlayerProfile, OrganizerProfile, Tournament, Stage,
TournamentRule, TeamEntry, TeamMember, Registration, AdminActionLog).

The full 9-phase version (Club, Merch, Ratings, Donations, Subscription
Plans, etc.) is preserved at `prisma/schema.full.prisma` — when you're ready
to build a later phase, copy the relevant models back into `schema.prisma`
and run a new migration. Don't migrate everything up front; add tables as
each phase is actually built.

Rules are plain free-text at Phase 1 (`TournamentRule.description` only) —
the structured type/severity/rule-set/template system is in the Phase 3
section of `schema.full.prisma`.

### Setup order, now that the schema is finalized for Phase 1:
```
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

## Registration & Room Reveal — full loop implemented

- `POST /api/tournaments/:id/register` — player joins (solo or team), enforces
  capacity, duplicate-registration, and payment-proof-required-if-paid checks
- `GET /api/tournaments/:id/registrations` — organizer views registrations for
  their own tournament (ownership enforced)
- `POST /api/registrations/:id/approve` / `.../reject` — organizer actions
- `GET /api/stages/:id/room` — **time-gated server-side**: returns 403 with
  `revealAt` until the countdown is actually over, and confirms the caller has
  an approved registration first. This can't be bypassed by inspecting network
  requests or editing client-side JS.
- `app/(player)/dashboard/page.tsx` — real "My Matches" page pulling live
  registration status from the database

The full Phase 1 core loop (browse → join → organizer approves → room reveal)
is now implemented end-to-end. Same sandbox limitation applies as before —
verify with `npx prisma generate && npm run build` once you have real
Supabase credentials.

## Fixed — Prisma 7 config migration

This project was originally written for Prisma 6's schema-based config
(`datasource { url = env(...) }`). A fresh `npm install` pulls **Prisma 7**,
which moved connection config out of `schema.prisma` entirely. Fixed:

- **`prisma.config.ts`** (new file, project root) — the CLI (`generate`,
  `migrate`, `studio`) now reads `DATABASE_URL` from here
- **`prisma/schema.prisma`** — the datasource block no longer has a `url`
  field (Prisma 7 rejects it there)
- **`lib/prisma.ts`** — the runtime client now requires an explicit driver
  adapter (`@prisma/adapter-pg`), passed to `new PrismaClient({ adapter })`
  instead of Prisma reading the URL implicitly

New dependencies added: `@prisma/adapter-pg`, `pg`, `@types/pg`, `dotenv`.

This was verified against Prisma's official v7 config reference — the config
now loads correctly (confirmed: "Loaded Prisma config from prisma.config.ts").
The only remaining failure in this sandbox is the same external network
restriction as before (`binaries.prisma.sh` blocked) — this will work
normally wherever you actually run `npx prisma generate`.
