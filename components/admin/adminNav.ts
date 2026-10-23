// Single source of truth for the admin sidebar AND the breadcrumbs, so a
// section is added in one place and shows up in both.
//
// Plain data (no JSX) so server and client code can both import it.

export type AdminIconName =
  | "overview" | "approvals" | "users" | "institutions" | "idPhotos" | "currencies"
  | "organizations" | "clubs" | "plans" | "featured" | "changeRequests"
  | "organizerTrust" | "deposits" | "payments" | "traffic" | "settings";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  /** Shows the pending-work count on this item. */
  badge?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Dashboard",
    items: [{ href: "/admin", label: "Overview", icon: "overview" }],
  },
  {
    label: "Review",
    items: [
      { href: "/admin/approvals", label: "Approvals", icon: "approvals", badge: true },
      { href: "/admin/change-requests", label: "Change requests", icon: "changeRequests" },
      { href: "/admin/institutions", label: "Institutions", icon: "institutions" },
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
      { href: "/admin/payments", label: "Payments", icon: "payments" },
      { href: "/admin/deposits", label: "Deposits", icon: "deposits" },
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
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

export function isAdminItemActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(href + "/");
}

export type Crumb = { label: string; href: string };

// "/admin/users/abc-123" -> Admin > Users > Abc 123. Known sections use their
// sidebar label; any deeper segment (an id or a future sub-page) is prettified.
export function adminCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("?")[0].split("/").filter(Boolean);
  if (segments[0] !== "admin") return [{ label: "Admin", href: "/admin" }];

  const crumbs: Crumb[] = [{ label: "Admin", href: "/admin" }];
  let href = "/admin";
  for (const seg of segments.slice(1)) {
    href += `/${seg}`;
    const known = ADMIN_NAV_ITEMS.find((i) => i.href === href);
    const label = known
      ? known.label
      : decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    crumbs.push({ label, href });
  }
  return crumbs;
}

export const ADMIN_SIDEBAR_COOKIE = "bk_admin_sidebar"; // "collapsed" | "expanded"
