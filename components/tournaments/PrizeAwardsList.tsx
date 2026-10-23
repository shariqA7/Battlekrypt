import { formatMoney } from "@/lib/money";

// Public list of special awards on a tournament page.
export default function PrizeAwardsList({
  awards,
  currency,
  winnerNames = {},
}: {
  awards: { id: string; name: string; cashAmount: unknown; prizeText: string | null; winnerUserId?: string | null }[];
  currency: string;
  winnerNames?: Record<string, string>;
}) {
  if (awards.length === 0) return null;
  return (
    <div className="bg-bk-surface border border-bk-border p-4">
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-2">Special awards</p>
      <ul className="space-y-1.5">
        {awards.map((a) => (
          <li key={a.id} className="font-sans text-[13px] text-bk-heading">
            {a.name}
            <span className="block font-mono text-[12px] text-bk-body">
              {[a.cashAmount != null ? formatMoney(Number(a.cashAmount), currency) : null, a.prizeText].filter(Boolean).join(" + ")}
            </span>
            {a.winnerUserId && winnerNames[a.winnerUserId] && (
              <span className="block font-sans text-[12px] text-bk-teal">Winner: {winnerNames[a.winnerUserId]}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
