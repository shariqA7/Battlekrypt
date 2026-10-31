// Single source of truth for the admin sidebar AND the breadcrumbs, so a
// section is added in one place and shows up in both.
//
// Plain data (no JSX) so server and client code can both import it.

export type AdminIconName =
  | "dashboard" | "approvals" | "users" | "institutions" | "idPhotos" | "currencies"
  | "organizations" | "clubs" | "plans" | "featured" | "changeRequests"
  | "organizerTrust" | "donations" | "deposits" | "payments" | "traffic" | "settings"
  // Dashboard stat cards
  | "teams" | "tournaments" | "registrations" | "bans" | "sessions"
  // Sub tabs
  | "rules" | "disputes" | "reports" | "consent" | "games" | "branding" | "login" | "tiers" | "challenges" | "review";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  /** Shows a pending-work count on this item: the sum of these attention counts. */
  badgeKeys?: string[];
  /** Same, but the count is whatever is waiting inside this page's own sub tabs. */
  badgeFromSubTabs?: boolean;
};

// An empty label means "no heading" (used for the Dashboard link at the top).
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "",
    items: [{ href: "/admin", label: "Dashboard", icon: "dashboard" }],
  },
  {
    label: "Review",
    items: [
      { href: "/admin/approvals", label: "Approvals", icon: "approvals", badgeFromSubTabs: true },
      { href: "/admin/change-requests", label: "Change requests", icon: "changeRequests", badgeKeys: ["changeRequests"] },
      { href: "/admin/reports", label: "Player reports", icon: "reports", badgeKeys: ["playerReports"] },
      { href: "/admin/institutions", label: "Institutions", icon: "institutions", badgeKeys: ["institutions"] },
      { href: "/admin/institution-proofs", label: "ID photos", icon: "idPhotos" },
      { href: "/admin/organizer-trust", label: "Organizer trust", icon: "organizerTrust" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/organizations", label: "Organizations", icon: "organizations" },
      { href: "/admin/clubs", label: "Clubs", icon: "clubs" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/admin/plans", label: "Plans", icon: "plans" },
      { href: "/admin/invoices", label: "Invoices", icon: "payments", badgeKeys: ["invoices"] },
      { href: "/admin/payments", label: "Payments", icon: "payments" },
      { href: "/admin/ledger", label: "Ledger", icon: "payments" },
      { href: "/admin/deposits", label: "Deposits", icon: "deposits" },
      { href: "/admin/donations", label: "Donations", icon: "donations", badgeKeys: ["donations"] },
      { href: "/admin/currencies", label: "Currencies", icon: "currencies" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/featured", label: "Featured", icon: "featured" },
      { href: "/admin/traffic", label: "Traffic", icon: "traffic" },
      { href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
  {
    label: "Team",
    items: [{ href: "/admin/staff", label: "Staff", icon: "users" }],
  },
];

// Pages that are split into sub tabs. Each sub tab is its own page (and loads
// only its own data). `countKey` links a tab to its pending-count badge
// (see lib/services/admin-attention.ts).
export type AdminSubTab = { href: string; label: string; icon: AdminIconName; countKey?: string };

export const ADMIN_SUBTABS: Record<string, AdminSubTab[]> = {
  "/admin/approvals": [
    { href: "/admin/approvals/organizations", label: "Organizations", icon: "organizations", countKey: "organizers" },
    { href: "/admin/approvals/identity", label: "Identity checks", icon: "idPhotos", countKey: "identity" },
    { href: "/admin/approvals/clubs", label: "Clubs", icon: "clubs", countKey: "clubs" },
    { href: "/admin/approvals/plan-payments", label: "Plan payments", icon: "payments", countKey: "planPayments" },
    { href: "/admin/approvals/tournaments", label: "Tournaments", icon: "tournaments", countKey: "tournamentReviews" },
    { href: "/admin/approvals/games", label: "Games", icon: "games", countKey: "games" },
    { href: "/admin/approvals/challenges", label: "Challenge review", icon: "review", countKey: "challengeReview" },
    { href: "/admin/approvals/disputes", label: "Disputes", icon: "disputes", countKey: "challengeDisputes" },
    { href: "/admin/approvals/payment-disputes", label: "Payment disputes", icon: "disputes", countKey: "paymentDisputes" },
    { href: "/admin/approvals/reports", label: "Reports & flags", icon: "reports", countKey: "challengeIntegrity" },
    { href: "/admin/approvals/consent", label: "Parental consent", icon: "consent", countKey: "consent" },
    { href: "/admin/approvals/suggested-rules", label: "Suggested rules", icon: "rules" },
  ],
  "/admin/settings": [
    { href: "/admin/settings/branding", label: "Branding", icon: "branding" },
    { href: "/admin/settings/clubs", label: "Clubs", icon: "clubs" },
    { href: "/admin/settings/login", label: "Login options", icon: "login" },
    { href: "/admin/settings/challenges", label: "Challenges", icon: "challenges" },
    { href: "/admin/settings/tiers", label: "Competitive tiers", icon: "tiers" },
    { href: "/admin/settings/plans", label: "Plans & ads", icon: "plans" },
    { href: "/admin/settings/billing", label: "Billing", icon: "payments" },
    { href: "/admin/settings/features", label: "Features", icon: "settings" },
  ],
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

// The number on a sidebar item: only what is waiting on THAT page. (Showing the grand total
// on "Approvals" meant a waiting change request lit up Approvals while every Approvals tab
// was empty, because change requests live on their own page.) `counts` is the `items` object
// from getAttentionCounts() in lib/services/admin-attention.ts.
export function navBadgeCount(item: AdminNavItem, counts: Record<string, number>): number {
  const keys =
    item.badgeKeys ??
    (item.badgeFromSubTabs ? (ADMIN_SUBTABS[item.href] ?? []).flatMap((t) => (t.countKey ? [t.countKey] : [])) : []);
  return keys.reduce((n, k) => n + (counts[k] ?? 0), 0);
}

export function isAdminItemActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export type Crumb = { label: string; href: string };

// "/admin/users/abc-123" -> Admin > Users > Abc 123. Known sections use their
// sidebar label; any deeper segment (an id or a future sub-page) is prettified.
export function adminCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  // /admin IS the dashboard, so the breadcrumb root is "Dashboard".
  if (segments[0] !== "admin") return [{ label: "Dashboard", href: "/admin" }];

  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/admin" }];
  let href = "/admin";
  for (const seg of segments.slice(1)) {
    href += `/${seg}`;
    const known =
      ADMIN_NAV_ITEMS.find((i) => i.href === href) ??
      Object.values(ADMIN_SUBTABS).flat().find((t) => t.href === href);
    // A record id in the address (a UUID) reads as "Details", not as the id itself.
    const label = known
      ? known.label
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)
      ? "Details"
      : decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    crumbs.push({ label, href });
  }
  return crumbs;
}

export const ADMIN_SIDEBAR_COOKIE = "bk_admin_sidebar"; // "collapsed" | "expanded"
