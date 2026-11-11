// The Settings area, grouped for the hub page (cards) and the sidebar inside
// each settings page. Labels and icons come from ADMIN_SUBTABS (adminNav.ts) so
// they never drift from the breadcrumbs; only the grouping and the one-line
// descriptions live here. Plain data so server and client code can both import it.
import { ADMIN_SUBTABS, type AdminIconName } from "./adminNav";

export type SettingsItem = {
  href: string;
  label: string;
  icon: AdminIconName;
  description: string;
  /** Extra words the settings search matches (what is inside the page), not shown on screen. */
  keywords: string;
};
export type SettingsGroup = { label: string; items: SettingsItem[] };

function item(href: string, description: string, keywords: string): SettingsItem {
  const tab = ADMIN_SUBTABS["/admin/settings"].find((t) => t.href === href);
  return { href, label: tab?.label ?? href.split("/").pop() ?? href, icon: tab?.icon ?? "settings", description, keywords };
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Platform",
    items: [
      item(
        "/admin/settings/branding",
        "Logo, share image, default pictures and the sign-in page carousel",
        "logo header footer favicon share image link preview banner avatar placeholder default picture club organizer organization carousel slide login background",
      ),
      item(
        "/admin/settings/login",
        "Sign-in options, including the Twitch button",
        "sign in signin login signup sign up twitch google discord button provider authentication",
      ),
      item(
        "/admin/settings/features",
        "Switch platform features on or off",
        "feature switch toggle flag on off giveaways challenges donations security deposit",
      ),
    ],
  },
  {
    label: "Competition",
    items: [
      item(
        "/admin/settings/tiers",
        "Prize pool floors and rating needed for each competitive tier",
        "competitive tier ladder rating min minimum prize pool floor rank national admin review instant region country world default",
      ),
      item(
        "/admin/settings/challenges",
        "Challenge prize limits and approval rules",
        "challenge prize cash in-game worth dollars usd limit threshold admin approval",
      ),
      item(
        "/admin/settings/clubs",
        "Club registration fee and how clubs pay it",
        "club registration fee payment instructions jazzcash easypaisa bank screenshot",
      ),
    ],
  },
  {
    label: "Money",
    items: [
      item(
        "/admin/settings/plans",
        "Plan payment instructions, security deposit, refund wait and ads for free plans",
        "plan plans subscription price organizer security deposit refund days multiplier payment instructions ads ad slots free plan",
      ),
      item(
        "/admin/settings/billing",
        "Payment methods, ways to pay and invoice details",
        "billing payment method ways to pay bank account number title branch coin crypto jazzcash easypaisa invoice tax name footer note renewal reminder",
      ),
    ],
  },
];
