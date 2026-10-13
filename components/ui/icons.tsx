// Small inline icons for the tournament page. All use currentColor, so they
// follow the theme.
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": true as const });

export const CalendarIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><rect x="3.5" y="5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
export const CoinIcon = ({ size = 28, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="9.2" stroke="currentColor" strokeWidth="1.8" /><path d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1c1.8.4 2.9 1 2.9 2.3 0 1.3-1.2 2.1-2.9 2.1-1.4 0-2.5-.6-3-1.7M12 6v1.7M12 16.3V18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
);
export const CheckIcon = ({ size = 16, className }: P) => (
  <svg {...base(size)} className={className}><path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const TrophyIcon = ({ size = 18, className }: P) => (
  <svg {...base(size)} className={className}><path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4.5v1.5A3 3 0 007.5 10.5M17 6h2.5v1.5a3 3 0 01-3 3M12 14v4M8.5 20h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const WarningIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}><path d="M12 3.5l9.5 16.5h-19L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 10v4.5M12 17.4v.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
export const ClockIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
export const MinusIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" /><path d="M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
export const BankIcon = ({ size = 22, className }: P) => (
  <svg {...base(size)} className={className}><path d="M3 9.5L12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3.5 20h17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
