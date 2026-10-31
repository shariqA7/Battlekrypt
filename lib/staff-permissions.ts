// Staff roles and what each one may open in the admin panel.
//
// Pure data and functions (no database, no React) so the server, the sidebar and the tests
// all use the same rules. The database side is lib/services/staff.ts.
//
// A permission is a SECTION of the admin panel. Each one has two levels:
//   view = can open it and read it
//   edit = can also change things in it (edit includes view)
// The super admin passes every check and is the only one who can manage staff.

export const STAFF_PERMISSIONS = [
  { key: "approvals", label: "Approvals", group: "Review", hint: "Organizer, club, tournament, game, challenge, dispute and consent queues" },
  { key: "change_requests", label: "Change requests", group: "Review", hint: "Tournament change requests" },
  { key: "reports", label: "Player reports", group: "Review", hint: "Reports about organizers and players" },
  { key: "institutions", label: "Institutions & ID photos", group: "Review", hint: "Institution verification and student ID photos" },
  { key: "organizer_trust", label: "Organizer trust", group: "Review", hint: "Trust standing of organizers" },
  { key: "users", label: "Users", group: "People", hint: "Accounts, bans" },
  { key: "organizations", label: "Organizations", group: "People", hint: "Organizer profiles and KYC" },
  { key: "clubs", label: "Clubs", group: "People", hint: "Club list and details" },
  { key: "plans", label: "Plans", group: "Money", hint: "Plan catalogue and assignment (no payment amounts)" },
  { key: "payments", label: "Payments & transactions", group: "Money", hint: "Payments, invoices, plan-payment approvals, payouts, payment methods, billing settings, and the revenue figure on the dashboard" },
  { key: "donations", label: "Donations & fund", group: "Money", hint: "Donations, donation campaigns and how the community fund is used" },
  { key: "deposits", label: "Deposits", group: "Money", hint: "Security deposits" },
  { key: "currencies", label: "Currencies", group: "Money", hint: "Enabled currencies" },
  { key: "ledger", label: "Ledger", group: "Money", hint: "Income and expense book and profit reports" },
  { key: "featured", label: "Featured", group: "Platform", hint: "Featured tournaments" },
  { key: "traffic", label: "Traffic", group: "Platform", hint: "Visits and sessions" },
  { key: "settings", label: "Settings", group: "Platform", hint: "Branding, login options, tiers, features and other platform settings" },
] as const;

export type StaffPermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
export const STAFF_PERMISSION_KEYS = STAFF_PERMISSIONS.map((p) => p.key) as StaffPermissionKey[];

/** "staff" is the Staff page itself: super admin only, never a toggle. */
export type AdminArea = StaffPermissionKey | "staff";

export type StaffRoleName = "super_admin" | "admin" | "manager";
export type StaffAccessLevel = "view" | "edit";
export type StaffGrants = Partial<Record<StaffPermissionKey, StaffAccessLevel>>;

export const STAFF_ROLE_LABELS: Record<StaffRoleName, string> = {
  super_admin: "Super admin",
  admin: "Admin",
  manager: "Manager",
};

export type StaffContext = { userId: string; role: StaffRoleName; grants: StaffGrants };

// Starting points for a new staff member. The owner can tick or untick anything afterwards,
// so these are only defaults, never limits. Money sections and the ledger are off for managers.
export const ROLE_TEMPLATES: Record<"admin" | "manager", StaffGrants> = {
  admin: {
    approvals: "edit", change_requests: "edit", reports: "edit", institutions: "edit", organizer_trust: "edit",
    users: "edit", organizations: "edit", clubs: "edit", plans: "edit", payments: "edit", deposits: "edit",
    currencies: "edit", donations: "edit", featured: "edit", traffic: "edit", settings: "edit",
    // ledger deliberately left out: switch it on per person.
  },
  manager: {
    approvals: "edit", change_requests: "edit", reports: "edit", institutions: "view", users: "view",
    organizations: "view", clubs: "view", traffic: "view",
  },
};

const rank = (l: StaffAccessLevel) => (l === "edit" ? 2 : 1);

/** Can this person open (view) or change (edit) this area? */
export function hasAccess(ctx: StaffContext | null | undefined, area: AdminArea, level: StaffAccessLevel = "view"): boolean {
  if (!ctx) return false;
  if (ctx.role === "super_admin") return true;
  if (area === "staff") return false;
  const granted = ctx.grants[area];
  return !!granted && rank(granted) >= rank(level);
}

/** The areas a person can at least view (used to filter the sidebar). */
export function visibleAreas(ctx: StaffContext | null | undefined): AdminArea[] {
  if (!ctx) return [];
  const all: AdminArea[] = [...STAFF_PERMISSION_KEYS, "staff"];
  return all.filter((a) => hasAccess(ctx, a, "view"));
}

// Which area an admin URL belongs to. More specific paths first. A path with no entry maps to
// "staff" (super admin only), so a page added later is locked until someone decides who sees it.
const PATH_AREAS: [string, StaffPermissionKey | "staff" | null][] = [
  ["/admin/approvals/plan-payments", "payments"],
  ["/admin/settings/billing", "payments"],
  ["/admin/approvals", "approvals"],
  ["/admin/change-requests", "change_requests"],
  ["/admin/reports", "reports"],
  ["/admin/institution-proofs", "institutions"],
  ["/admin/institutions", "institutions"],
  ["/admin/organizer-trust", "organizer_trust"],
  ["/admin/users", "users"],
  ["/admin/organizations", "organizations"],
  ["/admin/clubs", "clubs"],
  ["/admin/plans", "plans"],
  ["/admin/payments", "payments"],
  ["/admin/invoices", "payments"],
  ["/admin/donations", "donations"],
  ["/admin/deposits", "deposits"],
  ["/admin/currencies", "currencies"],
  ["/admin/ledger", "ledger"],
  ["/admin/featured", "featured"],
  ["/admin/traffic", "traffic"],
  ["/admin/settings", "settings"],
  ["/admin/staff", "staff"],
];

/** null = the dashboard, which every active staff member may open. */
export function areaForAdminPath(pathname: string): AdminArea | null {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/admin") return null;
  for (const [prefix, area] of PATH_AREAS) {
    if (path === prefix || path.startsWith(prefix + "/")) return area;
  }
  return "staff";
}

// Which area each /api/admin/<folder> belongs to. Unlisted folders fall back to "staff".
export const API_FOLDER_AREAS: Record<string, AdminArea | null> = {
  dashboard: null,
  staff: "staff",
  bans: "users", users: "users",
  organizations: "organizations", organizers: "organizations", ratings: "organizations",
  clubs: "clubs",
  "org-applications": "approvals", identity: "approvals", "club-name-claims": "approvals", "game-requests": "approvals",
  "challenge-disputes": "approvals", "challenge-flags": "approvals", "challenge-reports": "approvals",
  challenges: "approvals", "consent-cases": "approvals", "suggested-rules": "approvals", tournaments: "approvals", flags: "approvals",
  "change-requests": "change_requests",
  reports: "reports",
  institutions: "institutions", "institution-proofs": "institutions",
  "organizer-trust": "organizer_trust",
  plans: "plans", "plan-fields": "plans",
  payments: "payments", payouts: "payments", "plan-requests": "payments",
  invoices: "payments", "invoice-settings": "payments", "payment-methods": "payments",
  expenses: "ledger", ledger: "ledger",
  "payment-disputes": "approvals",
  deposits: "deposits",
  donations: "donations", "donation-campaigns": "donations", "fund-allocations": "donations", "donation-settings": "donations",
  currencies: "currencies",
  featured: "featured",
  "site-settings": "settings", "login-options": "settings", "challenge-settings": "settings", "tier-settings": "settings",
  features: "settings", "club-settings": "settings", "plan-settings": "settings", "carousel-slides": "settings",
};
