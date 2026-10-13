import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { countryName } from "@/lib/geo-data";
import { Badge, TierBadge } from "@/components/ui/Badge";
import LocalDate from "@/components/ui/LocalDate";

// One tournament card, shared by the home page and browse. Colour roles follow
// the spec: teal = live/open, amber = waiting, gold/mono = prize money.

type CardTournament = {
  slug: string;
  name: string;
  type: string;
  mode: string;
  status: string;
  startAt: Date | null;
  competitiveTier?: string | null;
  entryType: string;
  entryFeeAmount?: unknown;
  entryFeeCurrency?: string | null;
  prizePoolAmount?: unknown;
  prizePoolCurrency?: string | null;
  venueType?: string | null;
  venueCity?: string | null;
  audienceScope?: string | null;
  country?: string | null;
  game: { name: string };
};

const STATUS: Record<string, { label: string; tone: "teal" | "amber" | "neutral" | "danger" } | undefined> = {
  registration_open: { label: "Open", tone: "teal" },
  in_progress: { label: "Live", tone: "teal" },
  registration_closed: { label: "Closed", tone: "amber" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export default function TournamentCard({ t }: { t: CardTournament }) {
  const status = STATUS[t.status];
  const prize = t.prizePoolAmount ? formatMoney(t.prizePoolAmount as never, t.prizePoolCurrency ?? "PKR") : null;
  const fee =
    t.entryType === "paid" && t.entryFeeAmount
      ? formatMoney(t.entryFeeAmount as never, t.entryFeeCurrency ?? "PKR")
      : "Free entry";
  const tags = [
    t.venueType === "lan" ? `LAN${t.venueCity ? ` · ${t.venueCity}` : ""}` : t.venueType === "hybrid" ? "Hybrid" : null,
    t.audienceScope === "institution" ? "Students only" : null,
    t.country ? countryName(t.country) : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/tournaments/${t.slug}`}
      className="group flex h-full flex-col bg-bk-surface border border-bk-border p-4 transition-colors hover:border-bk-gold-from hover:bg-bk-surface-hover"
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 min-h-[24px]">
        {t.competitiveTier && <TierBadge tier={t.competitiveTier} />}
        {status && (
          <Badge tone={status.tone}>
            {t.status === "in_progress" && <span className="w-1.5 h-1.5 rounded-full bg-bk-teal" />}
            {status.label}
          </Badge>
        )}
      </div>

      <h3 className="font-sans font-bold text-[17px] leading-snug text-bk-heading break-words group-hover:text-bk-gold-light">
        {t.name}
      </h3>
      <p className="font-sans text-bk-muted text-xs mt-1 capitalize">
        {t.game.name} · {t.type} · {t.mode}
      </p>
      {tags.length > 0 && (
        <p className="font-sans text-bk-gold-light text-[10px] uppercase tracking-[0.8px] mt-2">{tags.join(" · ")}</p>
      )}

      <div className="flex-1" />
      <div className="mt-4 pt-4 flex items-end justify-between gap-3 border-t border-bk-border-soft">
        <div className="min-w-0">
          <p className="font-sans text-[10px] uppercase tracking-[1.2px] text-bk-muted">Prize pool</p>
          <p className="font-mono text-bk-gold-light text-base whitespace-nowrap">{prize ?? "—"}</p>
        </div>
        <div className="text-right min-w-0">
          <p className="font-mono text-bk-body text-xs">
            {t.startAt ? <LocalDate iso={t.startAt.toISOString()} /> : "TBA"}
          </p>
          <p className="font-sans text-bk-muted text-xs">{fee}</p>
        </div>
      </div>
    </Link>
  );
}
