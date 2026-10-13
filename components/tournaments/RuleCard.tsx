import { ClockIcon, MinusIcon, WarningIcon } from "@/components/ui/icons";

type Action = "warning" | "point_deduction" | "disqualification";

// One rule, as a card with an icon tile whose colour says how serious it is
// (red = disqualification, amber = point deduction, gold = warning).
export default function RuleCard({
  title,
  description,
  action,
  penaltyPoints,
  stageName,
}: {
  title: string | null;
  description: string;
  action: Action;
  penaltyPoints: number | null;
  stageName: string | null;
}) {
  const tone =
    action === "disqualification"
      ? { tile: "bg-bk-live/15 border-bk-live/40 text-bk-live", icon: <WarningIcon /> }
      : action === "point_deduction"
        ? { tile: "bg-bk-amber/15 border-bk-amber/40 text-bk-amber", icon: <MinusIcon /> }
        : { tile: "bg-bk-gold-from/15 border-bk-gold-to/50 text-bk-gold", icon: <ClockIcon /> };

  const consequence =
    action === "point_deduction"
      ? `Point deduction${penaltyPoints ? ` (−${penaltyPoints} pt${penaltyPoints === 1 ? "" : "s"})` : ""}`
      : action === "disqualification"
        ? "Disqualification"
        : "Warning";

  return (
    <li className="flex gap-4 bg-bk-surface border border-bk-border p-5">
      <span aria-hidden className={`w-12 h-12 shrink-0 border inline-flex items-center justify-center ${tone.tile}`}>
        {tone.icon}
      </span>
      <div className="min-w-0">
        {title && <p className="font-sans font-bold text-[13px] uppercase tracking-[1.4px] text-bk-heading">{title}</p>}
        <p className="mt-1 font-sans text-[15px] leading-relaxed text-bk-body">{description}</p>
        <p className="mt-2 font-mono text-[12px] text-bk-muted">
          {consequence}
          {stageName && ` · ${stageName} only`}
        </p>
      </div>
    </li>
  );
}
