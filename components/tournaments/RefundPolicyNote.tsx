import { describeRefundPolicy, type RefundPolicyKey } from "@/lib/seat-settings";

// The refund promise, in one plain sentence, shown before anyone pays. It can't change once teams
// have entered, so what a player reads here is what applies to them.
export default function RefundPolicyNote({
  policy,
  cutoffHours,
  payWindowMinutes,
  className = "",
}: {
  policy: RefundPolicyKey;
  cutoffHours: number;
  payWindowMinutes?: number;
  className?: string;
}) {
  return (
    <div className={`bg-bk-bg border border-bk-border px-3 py-2.5 ${className}`}>
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">Refund policy</p>
      <p className="font-sans text-[13px] text-bk-heading">{describeRefundPolicy(policy, cutoffHours)}</p>
      {payWindowMinutes ? (
        <p className="font-sans text-[12px] text-bk-muted mt-1.5">
          If the tournament is full and you join the waiting list, you pay nothing until a seat opens for you, then you have {payWindowMinutes} minutes to pay.
        </p>
      ) : null}
    </div>
  );
}
