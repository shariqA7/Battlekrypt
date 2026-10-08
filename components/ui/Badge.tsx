import type { ReactNode } from "react";

// Small labels. `tier` is the gold "S-TIER EVENT" badge from the mockup; the
// rest are status chips using the semantic colours (teal = live/active,
// amber = pending, red = danger, neutral = structure).

type Tone = "tier" | "live" | "teal" | "amber" | "danger" | "neutral";

const TONE: Record<Tone, string> = {
  tier: "border border-bk-gold-from/50 bg-bk-gold-from/15 text-bk-gold-light",
  live: "bg-bk-teal/15 text-bk-teal",
  teal: "bg-bk-teal/15 text-bk-teal",
  amber: "bg-bk-amber/15 text-bk-amber",
  danger: "bg-bk-live/15 text-bk-live",
  neutral: "bg-bk-border/60 text-bk-body",
};

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-sans font-bold text-[11px] uppercase tracking-[1.2px] px-2.5 py-1 ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

const TIER_LABEL: Record<string, string> = { D: "D-Tier", C: "C-Tier", B: "B-Tier", A: "A-Tier", S: "S-Tier", national: "National" };

export function TierBadge({ tier, suffix = "Event" }: { tier: string; suffix?: string }) {
  if (!tier || tier === "none") return null;
  return <Badge tone="tier">{`${TIER_LABEL[tier] ?? tier} ${suffix}`.trim()}</Badge>;
}
