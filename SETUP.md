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
