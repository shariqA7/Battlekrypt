// Sidebar icons. Same style as components/ui/icons.tsx: 24px grid, 1.8 stroke,
// currentColor so they follow the theme.
import type { ReactElement } from "react";
import type { AdminIconName } from "./adminNav";

const s = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const PATHS: Record<AdminIconName, ReactElement> = {
  dashboard: <><rect {...s} x="3.5" y="3.5" width="7" height="7" rx="1" /><rect {...s} x="13.5" y="3.5" width="7" height="7" rx="1" /><rect {...s} x="3.5" y="13.5" width="7" height="7" rx="1" /><rect {...s} x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
  approvals: <><circle {...s} cx="12" cy="12" r="8.5" /><path {...s} d="M8.2 12.4l2.6 2.6 5-5.6" /></>,
  changeRequests: <><path {...s} d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17v3z" /><path {...s} d="M13.5 8.5l2 2" /></>,
  institutions: <><path {...s} d="M2.5 9.5L12 4.5l9.5 5-9.5 5-9.5-5z" /><path {...s} d="M6 12v4.5c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5V12M21.5 9.5V15" /></>,
  idPhotos: <><rect {...s} x="3" y="5" width="18" height="14" rx="1.8" /><circle {...s} cx="8.5" cy="11" r="1.8" /><path {...s} d="M5.8 16c.5-1.4 1.6-2 2.7-2s2.2.6 2.7 2M14 10h4M14 13.5h3" /></>,
  organizerTrust: <><path {...s} d="M12 3.5l7.5 2.7v5.6c0 4.4-3.1 7.6-7.5 8.7-4.4-1.1-7.5-4.3-7.5-8.7V6.2L12 3.5z" /><path {...s} d="M8.8 12l2.2 2.2 4.2-4.4" /></>,
  users: <><circle {...s} cx="9" cy="8.5" r="3.3" /><path {...s} d="M2.8 19.5c.6-3.2 3.1-5 6.2-5s5.6 1.8 6.2 5" /><path {...s} d="M16 5.6a3.1 3.1 0 010 5.8M18.2 14.8c1.6.6 2.7 2 3 4.2" /></>,
  organizations: <><rect {...s} x="3" y="7.5" width="18" height="12" rx="1.5" /><path {...s} d="M8.5 7.5V5.8c0-.7.6-1.3 1.3-1.3h4.4c.7 0 1.3.6 1.3 1.3v1.7M3 12.5h18" /></>,
  clubs: <><path {...s} d="M12 3.5l7.5 2.5v6c0 4.2-3 7.4-7.5 9-4.5-1.6-7.5-4.8-7.5-9V6L12 3.5z" /><path {...s} d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4L12 8.5z" /></>,
  plans: <><path {...s} d="M12 3.5l9 4.5-9 4.5L3 8l9-4.5z" /><path {...s} d="M3 12.5l9 4.5 9-4.5M3 17l9 4.5 9-4.5" /></>,
  payments: <><rect {...s} x="3" y="5.5" width="18" height="13" rx="1.8" /><path {...s} d="M3 10h18M7 15h3.5" /></>,
  donations: <path {...s} d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0112 7.6a4.3 4.3 0 017.5 2.2C19.5 15.4 12 20 12 20z" />,
  deposits: <><rect {...s} x="3.5" y="10.5" width="17" height="10" rx="1.6" /><path {...s} d="M7.5 10.5V8a4.5 4.5 0 019 0v2.5M12 14.5v2.5" /></>,
  currencies: <><circle {...s} cx="12" cy="12" r="9.2" /><path {...s} d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1c1.8.4 2.9 1 2.9 2.3 0 1.3-1.2 2.1-2.9 2.1-1.4 0-2.5-.6-3-1.7M12 6v1.7M12 16.3V18" /></>,
  featured: <path {...s} d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5z" />,
  traffic: <><path {...s} d="M3.5 20.5h17" /><rect {...s} x="5" y="12" width="3.2" height="6" rx=".6" /><rect {...s} x="10.4" y="7" width="3.2" height="11" rx=".6" /><rect {...s} x="15.8" y="9.5" width="3.2" height="8.5" rx=".6" /></>,
  teams: <><circle {...s} cx="8" cy="9" r="2.6" /><circle {...s} cx="16.5" cy="9" r="2.6" /><path {...s} d="M2.8 18.5c.5-2.6 2.5-4 5.2-4s4.7 1.4 5.2 4M13.6 14.7c.9-.4 1.9-.5 2.9-.4 2.4.3 4 1.6 4.7 4.2" /></>,
  tournaments: <><path {...s} d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4.5v1.5A3 3 0 007.5 10.5M17 6h2.5v1.5a3 3 0 01-3 3M12 14v4M8.5 20h7" /></>,
  registrations: <><rect {...s} x="5" y="3.5" width="14" height="17" rx="1.6" /><path {...s} d="M8.7 9.3l1.4 1.4 2.4-2.6M8.7 15h6.6M13.8 9.6h1.5" /></>,
  bans: <><circle {...s} cx="12" cy="12" r="8.5" /><path {...s} d="M6 6l12 12" /></>,
  sessions: <><circle {...s} cx="12" cy="12" r="8.5" /><path {...s} d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5z" /></>,
  rules: <><path {...s} d="M5 4.5h11.5a2 2 0 012 2V19.5H7a2 2 0 01-2-2V4.5z" /><path {...s} d="M5 17.5a2 2 0 012-2h11.5M9 8.5h6M9 11.5h4" /></>,
  disputes: <><path {...s} d="M12 4v16M7 20h10M4.5 7.5h15" /><path {...s} d="M4.5 7.5L2.5 13a3 3 0 005 0l-2-5.5M19.5 7.5L17.5 13a3 3 0 005 0l-2-5.5" /></>,
  reports: <><path {...s} d="M6 21V4M6 5h11l-2 3.5L17 12H6" /></>,
  consent: <><path {...s} d="M12 20.5s-7.5-4.3-7.5-10A4.3 4.3 0 0112 8a4.3 4.3 0 017.5 2.5c0 5.7-7.5 10-7.5 10z" /><path {...s} d="M9.3 12l1.9 1.9 3.5-3.6" /></>,
  games: <><rect {...s} x="2.8" y="7.5" width="18.4" height="10" rx="3.5" /><path {...s} d="M8 10.5v4M6 12.5h4M15.5 11.5h.01M17.8 13.5h.01" /></>,
  branding: <><path {...s} d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1-1.6-1-2.8 0-1 .8-1.7 1.9-1.7H17a3.6 3.6 0 003.5-3.6C20.5 6.7 16.7 3.5 12 3.5z" /><circle {...s} cx="7.8" cy="11" r=".6" /><circle {...s} cx="10.5" cy="7.6" r=".6" /><circle {...s} cx="15" cy="8" r=".6" /></>,
  login: <><circle {...s} cx="8.5" cy="14.5" r="3.5" /><path {...s} d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" /></>,
  tiers: <><path {...s} d="M4 20.5h4.5v-5H4v5zM9.8 20.5h4.4V11H9.8v9.5zM15.5 20.5H20V6h-4.5v14.5z" /></>,
  challenges: <><circle {...s} cx="12" cy="12" r="8.5" /><circle {...s} cx="12" cy="12" r="4.5" /><circle {...s} cx="12" cy="12" r="1" /></>,
  review: <><rect {...s} x="4" y="4" width="16" height="16" rx="1.8" /><path {...s} d="M8 9h8M8 12.5h8M8 16h4.5" /></>,
  settings: <><circle {...s} cx="12" cy="12" r="3" /><path {...s} d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M18 6l-1.6 1.6M7.6 16.4L6 18" /></>,
};

export function AdminIcon({ name, size = 20, className }: { name: AdminIconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

// Chrome icons for the shell itself.
export const ChevronsLeft = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M11 6l-6 6 6 6M19 6l-6 6 6 6" /></svg>
);
export const ChevronsRight = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M13 6l6 6-6 6M5 6l6 6-6 6" /></svg>
);
export const ChevronRight = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M9 5l7 7-7 7" /></svg>
);
export const MenuIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const CloseIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M6 6l12 12M18 6L6 18" /></svg>
);
export const HomeIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path {...s} d="M4 11l8-7 8 7v8.5a1.5 1.5 0 01-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 014 19.5V11z" /></svg>
);
