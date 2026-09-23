// Same visual language as the Stage Rail used on tournament detail pages
// and the organizer creation flow (Registration → Qualifiers → Semis →
// Finals): a horizontal connected-node strip that reflects a real
// sequence, not decoration. Here the sequence is the account setup itself
// — Sign in → Complete profile → Play — so a returning user (who skips
// straight from step 1 to their destination) never sees it at all.
interface AuthStageRailProps {
  step: 1 | 2;
}

const STEPS = ["Sign in", "Complete profile", "Play"];

export default function AuthStageRail({ step }: AuthStageRailProps) {
  return (
    <div className="flex items-start w-full max-w-[340px] mb-8" aria-label="Sign-up progress">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < step;
        const active = stepNum === step;
        const isLast = i === STEPS.length - 1;

        return (
          <div key={label} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                className={`w-2 h-2 rounded-full border ${
                  done || active
                    ? "bg-bk-gold-light border-bk-gold-light"
                    : "bg-transparent border-bk-border"
                }`}
              />
              <span
                className={`font-sans text-[10px] tracking-[0.6px] uppercase whitespace-nowrap ${
                  active ? "text-bk-heading" : done ? "text-bk-gold-light" : "text-bk-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {!isLast && (
              <div
                className={`flex-1 h-px mx-2 ${done ? "bg-bk-gold-light" : "bg-bk-border"}`}
                style={{ marginTop: "3px" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
