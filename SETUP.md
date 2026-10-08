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

## Fixed — DATABASE_URL not resolving in prisma.config.ts

If you saw `PrismaConfigEnvError: Cannot resolve environment variable:
DATABASE_URL`, that was because `prisma.config.ts` used the bare
`import "dotenv/config"`, which only auto-loads a file literally named
`.env` — but this project (like all Next.js apps) uses `.env.local`.

Fixed by loading `.env.local` explicitly in `prisma.config.ts`. Verified
working in this sandbox: `npx prisma generate` now prints
`injected env (1) from .env.local` and `Loaded Prisma config from
prisma.config.ts` before failing only on the sandbox's unrelated network
restriction (blocked access to binaries.prisma.sh) — that step will
succeed normally on your machine.

## Organizer onboarding, dashboard, and tournament creation — now built

- `POST /api/organizer/onboard` — self-upgrade from Player to Organizer
- `GET /api/games` — powers the game dropdown on tournament creation
- `app/organizer/onboard/page.tsx` — real onboarding form
- `app/organizer/dashboard/page.tsx` — shows approval status banner + live
  tournament list with status dots
- `app/organizer/dashboard/tournaments/new/page.tsx` — full creation form
  using the real CurrencyInput component, posts to `POST /api/tournaments`

### Important fix — route collision avoided
Organizer routes moved from a `(organizer)` route group to a real `/organizer`
URL segment. Route groups `(name)` don't appear in the URL — so
`(organizer)/dashboard` and `(player)/dashboard` would have both resolved to
the identical path `/dashboard` and failed to build. Player dashboard stays
at `/dashboard`; organizer dashboard is now at `/organizer/dashboard`.
`proxy.ts` updated to protect `/organizer` too.

### Important fix — passwordHash removed from schema
`User.passwordHash` was a leftover from before this project committed to
Supabase Auth for all credentials. Since Supabase owns authentication
entirely, this project's own `User` table should never store or fake a
password. Removed from both `schema.prisma` and `schema.full.prisma`;
`User.id` now explicitly matches Supabase's `auth.users.id` rather than
generating its own UUID.

### New: ensureUserRecord helper
`lib/ensure-user.ts` — creates/updates the local `User` row from a Supabase
auth user. Called centrally in `app/auth/callback/route.ts` right after
login/signup, with defensive fallbacks in the onboard and register routes
for edge cases (e.g. a session that predates this fix).

### New: seed script
`prisma/seed.ts` seeds 6 launch games (PUBG Mobile, BGMI, Free Fire, MLBB,
Valorant, League of Legends) per the spec's "start small, expand via Request
a Game" approach. Run after migrating:
```
npx prisma db seed
```

## Admin panel, game requests, and file uploads — now built

### Admin panel (`/admin`)
- `lib/admin-helpers.ts` — `requireAdmin()`, checks `User.isAdmin`
- `POST /api/admin/organizers/:id/approve` / `.../reject` — flips `kycStatus`,
  which is the exact gate `publishTournament` checks. This is the missing
  link that makes the whole approval flow real, not just described.
- `POST /api/admin/game-requests/:id/approve` / `.../reject` — approving
  auto-creates the actual `Game` row
- Every admin action writes an `AdminActionLog` row — a real audit trail
- `app/(admin)/admin/page.tsx` + `AdminQueues.tsx` — real UI, optimistic
  removal from the list on approve/reject

**To make yourself an admin**: there's intentionally no self-service way to
do this (an admin flag should never be user-settable). Set it directly in
Supabase's Table Editor: find your row in `User`, set `isAdmin` to `true`.

### Game requests
- `POST /api/games/request` — organizers can now actually submit these,
  which is what populates the admin queue above

### File uploads (Supabase Storage)
- `components/ui/FileUpload.tsx` — uploads directly from the browser to
  Supabase Storage, returns a public URL
- Wired into: tournament banner (creation form) and payment proof
  (new join-tournament flow, `/tournaments/:id/join` — this page didn't
  exist before; the "Join tournament" button was previously a dead end)

**Required Supabase setup**: create a Storage bucket named
`tournament-assets` (Dashboard → Storage → New bucket, make it **public**
for now since Phase 1 doesn't yet require signed URLs). Without this bucket,
uploads will fail with a "bucket not found" error.

### New page: `/tournaments/:id/join`
Real registration form — team name (if not solo), the tournament's
organizer-defined custom fields, and payment proof upload if paid. This
closes the last major gap in the click-through demo: a player can now go
browse → view → join → get approved → see the room, entirely through the UI.

## Organizer management UI + room reveal — Phase 1 core loop is now complete

### Organizer tournament management (`/organizer/dashboard/tournaments/:id`)
- **Registration queue** — approve/reject with one click, view payment proof
  screenshots inline, status badges update live without a page reload
- **Stage manager** — add stages (Qualifiers/Semis/Finals), set room ID/
  password/reveal time per stage — this was previously only reachable by
  hand-crafting API requests
- **Publish button** — the missing UI for `POST /tournaments/:id/publish`.
  Correctly disabled-by-status, and surfaces the exact "pending admin
  approval" error message if the organizer isn't approved yet

### Room reveal, on the actual tournament page
`app/(public)/tournaments/[id]/RoomReveal.tsx` — approved registrants can
click "Reveal room" and get either the real room ID/password, or a
"Reveals at [time]" message if the countdown hasn't finished. This calls
the already-time-gated `GET /api/stages/:id/room` endpoint — the enforcement
was already real, it just had no UI in front of it until now.

### What's now fully clickable, start to finish
Sign up → become organizer → (wait for admin approval) → create tournament
→ add a stage → publish → player finds it on `/tournaments` → joins with
payment proof → organizer approves in the queue → organizer sets the room
→ player reveals the room once the countdown passes.

Every step in that sentence is now a real page backed by a real API route —
this is the complete Phase 1 loop from the original spec.

## Signup route fixed + real search/filter UI added

### Fixed: /signup was a dead route
`app/(auth)/signup/page.tsx` was an empty folder left over from the original
scaffold — clicking "Sign Up" in the Nav would 404. Since this project's auth
model (magic link / OAuth) creates an account automatically on first login —
there's no separate registration step — `/signup` now just redirects to
`/login`, preserving `redirectTo` if present.

### Added: real filter UI on the browse page
Previously `listTournaments` supported filtering by game/search/type/
entryType, but the actual page only ever passed `game` and `search` — `type`
and `entryType` filters existed in the backend with no way to use them.

- `app/(public)/tournaments/FilterBar.tsx` (new) — search input, game
  dropdown (populated from `/api/games`), and pill buttons for entry type
  (free/paid) and tournament type (tournament/league/scrim). Writes to the
  URL as query params, so filtered views are shareable links, not just
  client-side state.
- `app/(public)/tournaments/page.tsx` (modified) — now passes all four
  filters through to `listTournaments`, wraps `FilterBar` in `Suspense`
  (same `useSearchParams` requirement that came up with the login page
  earlier), and fixes a real bug: an empty-string filter value (meaning "no
  filter") was being passed straight to Prisma, which would have filtered
  for `type: ""` and matched nothing instead of matching everything.

## Correction — the previous "Phase 1 completion" entry was based on a bad gap analysis

The "what's left in Phase 1" review two turns ago was answered from
conversation memory instead of checking the actual code, and was wrong —
most of what was listed as "missing" was already built earlier in this
session, including a proper `TournamentFlag` database model. Blindly
rebuilding it created **11 duplicate function definitions** in
`lib/services/tournaments.ts`, which would have failed to compile.

Fixed by:
- Truncating the file back to its original 30 functions, zero duplicates
- Rewriting every new route/page this "completion" pass touched to call the
  **real** function names and signatures instead of invented ones:
  - `players/me` now calls `getPlayerProfileByUserId` (not `getPlayerProfile`)
  - `organizer/me` now calls `getOrganizerByUserId` / the real
    `updateOrganizerProfile(organizerId, userId, input)` signature
  - The public organizer profile page now renders the real return shape
    (`_count.tournaments`, `completedTournaments`) instead of fields that
    were never actually returned
  - **Real bug fixed**: `getPublicOrganizerProfile` never selected
    `user.kycStatus`, so the Verified badge would have shown for every
    organizer unconditionally regardless of approval status — added the
    missing field and made the badge conditional
  - Disqualify now correctly requires a `reason` (the real function doesn't
    make it optional) — added validation server-side and a prompt in the UI
  - Cancel route error code fixed (`invalid_status`, not `already_final`)
  - Flagged-tournaments admin UI rewritten to match the real shape (full
    `Tournament` objects with nested `.flags[]`, using the dedicated
    `TournamentFlag` model — not flat records off `AdminActionLog`)

## Confirmed still genuinely missing (small, honest gap)

- `GET /api/players/:id` exists as a route but has no actual page —
  there's no public player profile UI yet, just the API

## Final gap closed — GET /api/players/me/registrations

A programmatic check against every endpoint listed in `api-contract-phase1.md`
(not a memory-based review, an actual script comparing the contract against
real files) found exactly one gap: `GET /api/players/me/registrations`
existed as underlying logic (`getMyRegistrations`, used internally by the
`/dashboard` page) but was never exposed as an HTTP route — the same
"web works, mobile has nothing to call" gap already fixed once for
organizers.

Added `app/api/players/me/registrations/route.ts`. Re-ran the same
verification script afterward: **all 35 custom endpoints from the contract
now exist**, and the duplicate-function check remains clean at 30 functions.


## Phase 8.1 — Institution verification

Players verify their institution once on **Dashboard → Profile settings**; admins review on **/admin/institutions**. Run `npx prisma migrate dev` to apply `20261002200000_phase8_1_institution_verification`.

**Required Supabase setup** (SQL editor) — the ID photos go in a PRIVATE bucket, unlike `tournament-assets`:

```sql
insert into storage.buckets (id, name, public)
values ('institution-ids', 'institution-ids', false)
on conflict (id) do nothing;

-- a player may only upload into their own folder: <userId>/<file>
create policy "players upload own institution id"
on storage.objects for insert to authenticated
with check (bucket_id = 'institution-ids' and (storage.foldername(name))[1] = auth.uid()::text);

-- only admins can read ID photos (the admin page uses 5-minute signed links)
create policy "admins read institution ids"
on storage.objects for select to authenticated
using (
  bucket_id = 'institution-ids'
  and exists (select 1 from public."User" u where u.id = auth.uid()::text and u."isAdmin")
);
```

`FileUpload` has a new `isPrivate` prop: it returns the storage path instead of a public URL.

## Phase 8.2 — Students-only tournaments

Run `npx prisma migrate dev` to apply `20261002210000_phase8_2_audience_scope`.

Organizers choose **Everyone / Students only** when creating or editing a draft (and optionally ask for a fresh ID photo per registration). It's saved in templates too. Once active registrations exist, the setting can't change.

**Required Supabase setup** (only if you use the "fresh ID photo" option) — a second PRIVATE bucket whose photos only the tournament's organizer can read:

```sql
insert into storage.buckets (id, name, public)
values ('institution-proofs', 'institution-proofs', false)
on conflict (id) do nothing;

create policy "players upload own institution proof"
on storage.objects for insert to authenticated
with check (bucket_id = 'institution-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "organizers read proofs for their tournaments"
on storage.objects for select to authenticated
using (
  bucket_id = 'institution-proofs'
  and exists (
    select 1
    from public."Registration" r
    join public."Tournament" t on t.id = r."tournamentId"
    join public."OrganizerProfile" o on o.id = t."organizerId"
    where r."institutionProofPath" = storage.objects.name
      and o."userId" = auth.uid()::text
  )
);
```

## Institutes and co-hosts (replaces the admin-reviewed student verification)

Run `npx prisma migrate deploy` (or `migrate dev`) to apply `20261007000000_institutes_cohosts` and `20261007010000_institute_quotas`.

**How it works now**

- An organization registers the institute it runs (**Organizer → My institute**). An admin verifies the institute once (**Admin → Institutes**).
- A player belongs to **one** verified institute, chosen from their profile. They can change it once every 7 days, after confirming a warning.
- Institution-only tournaments are open to the host institute's members, plus any **co-host** or **guest** institutes the host adds. The institute, not the admin, approves each entry for each tournament.
  - **Co-host:** must accept the invite; approves or rejects **only its own institute's** players. The host still sees every request (**All requests** / **My requests**).
  - **Guest:** its players may enter, but the host approves them.
  - On a **paid** tournament a co-host confirms eligibility only; the host still confirms the payment before the entry becomes approved.
- **One institute per team.** In an institution-only tournament every player on a team must belong to the same institute; mixed teams are refused (also when a club edits its roster afterwards). Open tournaments are unaffected.
- **Entry quotas.** The host sets how many entries (solo players or teams) each institute may send: a default for all institutes plus an optional override per co-host/guest institute (**Manage tournament → Participating institutes**). Pending and approved entries count; rejecting one frees the slot. Organizer manual-add can't bypass the quota.
- **Institute lock.** While a player has a live entry — a pending/approved registration (as registrant or team member) in a tournament that isn't completed or cancelled, or an applied/selected challenge application — they can't change institute. Their institute approved them and is responsible for them until it ends.
- Existing students who typed an institute name before this change keep their name but must pick their institute from the list again before entering institution-only tournaments. Old admin-review fields on `PlayerInstitution` are legacy and unused.

**Supabase storage** — add this policy so a co-host can open the per-tournament ID photos of its own players (the existing "organizers read proofs" policy only covers the host):

```sql
create policy "co-host institutes read proofs of their players"
on storage.objects for select to authenticated
using (
  bucket_id = 'institution-proofs'
  and exists (
    select 1
    from public."Registration" r
    join public."TournamentInstitution" ti
      on ti."tournamentId" = r."tournamentId"
     and ti."institutionId" = r."routedInstitutionId"
     and ti."role" = 'cohost'
     and ti."status" = 'accepted'
    join public."Institution" i on i.id = ti."institutionId"
    join public."OrganizerProfile" o on o.id = i."organizerId"
    where r."institutionProofPath" = storage.objects.name
      and o."userId" = auth.uid()::text
  )
);
```

## Phase 8.3 — LAN venues and check-in

Run `npx prisma migrate dev` to apply `20261006030000_phase8_3_venue_checkin`. No new Supabase setup.

Organizers pick **Online / LAN** when creating or editing a draft. LAN needs a venue name, address and city before it can be published, has no Room ID/password, and gets a 6-character check-in code that only the organizer sees. Players with an approved entry check in by typing the code in the check-in window; the organizer can also check people in, mark no-shows, or undo, at any time before the event ends. Five wrong codes lock a player's self check-in (the organizer can still check them in). Online ↔ LAN can't be switched once anyone has registered; venue details can still be corrected.

Security fix included: public tournament pages and `GET /api/tournaments/:id` used to return each stage's room ID and password to anyone, bypassing the timed reveal. They are now stripped from every public response (`toPublicTournament`) and only come from `/api/stages/:id/room` after the reveal time.

## Phase 8.4 — Hybrid tournaments (online qualifiers → LAN finals)

Run `npx prisma migrate dev` to apply `20261006040000_phase8_4_hybrid_stages`. No new Supabase setup.

Pick **Hybrid** as the venue when creating a tournament, then on the tournament page set each stage to **Online** or **LAN**. A hybrid tournament needs at least one online and one complete LAN stage to publish.

- **Advancing:** each stage lists the approved entries with a checkbox, plus "Advance the top N by points". Only advanced entries can use a *restricted* stage.
- **LAN stages** are always restricted, have their own venue and check-in code, and no room credentials. Players who advanced check in with the code; the organizer can check in / mark no-shows / undo per entry.
- **Online stages** can optionally be restricted ("only entries I advance can see its room").
- Venue type of a stage is locked once someone has checked in to it. Switching the tournament away from Hybrid is only possible before anyone registers and resets all stages to plain online.

## Phase 8.5 — More currencies and regions

Run `npx prisma migrate dev` to apply `20261006050000_phase8_5_currencies_regions`. No new Supabase setup.

**Currencies.** The platform now knows 26 currencies (the original five plus BDT, LKR, NPR, QAR, KWD, BHD, OMR, EGP, TRY, MYR, IDR, PHP, THB, VND, SGD, EUR, GBP, CAD, AUD, ZAR, NGN). Only the original five are switched on after the migration. Turn more on or off at **/admin/currencies**; organizers' currency pickers and the API follow it. A tournament keeps its currency if it is switched off later; USD can't be switched off (tier floors are measured in it). Adding a brand-new currency to the platform is one line in `lib/money.ts` plus switching it on.

**Exchange rates — bug fix.** `lib/currency-fx.ts` used `api.frankfurter.app`, which only carried the ECB's 31 currencies, so PKR, SAR and AED lookups could not have worked and any tournament with a competitive tier in those currencies would have been stuck on "try again shortly". It now uses Frankfurter v2 (`api.frankfurter.dev`), which carries them. If the lookup is down, SAR and AED (hard-pegged to the dollar) fall back to the peg; every other currency still fails open rather than guessing. Please check one PKR tier tournament on your deployed site: my sandbox couldn't reach the live API, so this was tested against a mock of its documented response.

**Regions.** Tournaments have an optional `country` (ISO code; empty = worldwide), set in the create/edit forms and defaulting to the organizer's own country when it is recognisable. Existing tournaments were backfilled for Pakistan, India, Saudi Arabia and the UAE only; the rest stay worldwide. The browse page has an "Everywhere / region / country" filter. Filtering by a country or region also shows worldwide tournaments, since those are open to everyone. Regions are derived from the country in `lib/geo-data.ts` (not stored).

## Phase 8.6 — Mobile layout and notched phones

No migration, no setup. Checked in a real headless browser at 320, 375, 390, 430 px, landscape (844×390) and tablet (768×1024), with a simulated iPhone notch (47 px top, 34 px home bar, 47 px landscape sides): no sideways scrolling on any public page, and content and the nav clear the notch.

- **Notch / safe areas:** the page now declares `viewport-fit=cover` (plus a browser-bar colour) in `app/layout.tsx`, and `globals.css` keeps content clear of the notch, rounded corners and home indicator with `env(safe-area-inset-*)` (all zero on phones without a notch). The top bar grows under the notch and stays edge to edge in landscape. New fixed or sticky elements should use the same insets (see `MobileMenu.tsx`).
- **Navigation:** the desktop bar needs about 1000 px, so below the `lg` breakpoint (phones and tablets) it becomes a menu button with a slide-in drawer; signed-in users keep their avatar menu in the bar.
- **Forms and cards:** two- and three-column form grids stack on phones; fixed-width cards (login, forgot/reset password, onboarding, club register, sign-in popup) now shrink to the screen; the tournament filter bar wraps into one row per filter with 44 px touch targets; the tournament header stacks with a full-width Join button; prize amounts no longer break mid-number.
- **iOS zoom:** every text field is forced to 16 px on phones. Below that, iOS Safari zooms the page when you tap a field and doesn't zoom back, which looks like the layout being cut off.
- **Not covered:** signed-in screens (dashboards, organizer tools, admin) could not be opened in my test setup because there is no Supabase login there; they got the same grid/width fixes from a code audit but have not been viewed on a phone.

## Design system (D1) — themes, tokens, shared components

The app has two themes, **dark** (default, matches the design mockup) and **light**, switched by the sun/moon button in the top bar. The choice is stored in the browser (`localStorage` key `bk-theme`) and applied before the page paints, so there is no flash.

- **Colors live in one place:** `app/globals.css`. `:root` is the dark theme and `:root[data-theme="light"]` overrides it. Components use the Tailwind names (`bg-bk-bg`, `bg-bk-surface`, `text-bk-heading`, `text-bk-body`, `text-bk-muted`, `text-bk-gold-light`, `border-bk-border`, `bg-bk-primary text-bk-on-primary`, `text-bk-amber`, `text-bk-teal`, `text-bk-live`, ...). **Never write a raw hex color or `bg-white` in a component:** it will not follow the theme. For a tint use an opacity, e.g. `bg-bk-live/15`.
- **Contrast:** every text/background pair in both themes was checked against WCAG AA (4.5:1). `text-bk-faint` is deliberately below AA and is only for decorative or "not yet" states.
- **Shared components:** `components/ui/Button.tsx` (primary / outline / ghost / danger, 44 px touch targets on phones), `Badge.tsx` (tier and status chips), `Panel.tsx` (card, gold-bar section heading, small uppercase label), and `components/layout/ThemeToggle.tsx`.
- Brand colors (Google, Discord) and the verified-badge gold stay fixed on purpose.
