// VerifiedBadge.tsx
// Derived flag, per spec: verified = subscription_plan != free AND kyc_status == approved (org/club)
//                          verified = subscription_plan != free (player)
// Never store this as a separate field — compute it from plan + kyc status.

interface VerifiedBadgeProps {
  size?: number;
}

export function VerifiedBadge({ size = 15 }: VerifiedBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-label="Verified"
      role="img"
    >
      <defs>
        <linearGradient id="bk-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F4C842" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path
        fill="url(#bk-gold-grad)"
        d="M12 1l2.6 2.1 3.3-.4 1 3.2 3 1.5-.9 3.3 1.9 2.8-2.4 2.4.4 3.3-3.3.5-1.6 2.9-3-1.3-3 1.3-1.6-2.9-3.3-.5.4-3.3-2.4-2.4 1.9-2.8-.9-3.3 3-1.5 1-3.2 3.3.4L12 1z"
      />
      <path
        fill="#0B0C10"
        d="M9.5 12.6l1.8 1.8 3.7-4.1"
        stroke="#0B0C10"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fillOpacity="0"
      />
    </svg>
  );
}

// Usage example — name + verified badge, matching the pattern used
// for the organizer credibility block on Tournament Detail:
//
// <span className="font-sans font-medium text-[14px] text-[#EAE1D3] flex items-center gap-1">
//   Falcons Esports
//   {isVerified && <VerifiedBadge />}
// </span>
