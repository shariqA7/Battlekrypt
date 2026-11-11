import { SETTINGS_GROUPS, type SettingsGroup } from "@/components/admin/settingsNav";
import { areaForAdminPath, hasAccess } from "@/lib/staff-permissions";

// The settings this staff member may open (Billing is money, so it needs the
// Payments permission too). Groups left empty are dropped.
export function settingsGroupsFor(staff: Parameters<typeof hasAccess>[0]): SettingsGroup[] {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      const area = areaForAdminPath(i.href);
      return area === null || hasAccess(staff, area);
    }),
  })).filter((g) => g.items.length > 0);
}
