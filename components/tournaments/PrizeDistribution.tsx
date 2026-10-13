import { formatMoney } from "@/lib/money";
import { BankIcon } from "@/components/ui/icons";
import { placeLabel } from "@/lib/services/prize-tiers";

// "Prize distribution" panel: finishing places on the left, what each wins on
// the right, the winner's row highlighted — as in the design mockup.
export default function PrizeDistribution({
  tiers,
  currency,
}: {
  tiers: { id: string; positionFrom: number; positionTo: number; amount: unknown }[];
  currency: string;
}) {
  if (tiers.length === 0) return null;
  return (
    <section
      aria-labelledby="prize-dist"
      className="border border-bk-border p-5 sm:p-6"
      style={{
        background:
          "radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--bk-gold-from) 14%, transparent), transparent 55%), var(--bk-surface)",
      }}
    >
      <h2 id="prize-dist" className="flex items-center gap-3 pb-4 border-b border-bk-border font-sans font-bold text-[13px] uppercase tracking-[1.6px] text-bk-heading">
        <BankIcon size={22} className="text-bk-gold" />
        Prize distribution
      </h2>
      <ul className="mt-3">
        {tiers.map((t, i) => (
          <li
            key={t.id}
            className={`flex items-center justify-between gap-4 px-3 py-4 ${
              i === 0 ? "border-l-[3px] border-l-bk-gold-from bg-bk-heading/[0.06]" : "border-b border-bk-border last:border-b-0"
            }`}
          >
            <span className="font-sans font-bold text-[12px] uppercase tracking-[1.4px] text-bk-body">
              {placeLabel(t.positionFrom, t.positionTo)}
            </span>
            <span className="font-mono text-[15px] sm:text-[17px] font-medium text-bk-heading whitespace-nowrap">
              {formatMoney(Number(t.amount), currency)}
              {t.positionTo > t.positionFrom && <span className="text-bk-muted text-[13px]"> ea</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
