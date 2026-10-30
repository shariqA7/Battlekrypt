// Every admin PAGE calls this first. A layout alone isn't enough: Next.js
// doesn't re-run layouts on client-side navigation, so each page has to
// verify the admin itself before loading any data.
//
// Pass the area the page belongs to (see lib/staff-permissions.ts). Staff without access to
// it are sent back to the dashboard; people who are not staff go to the home page.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { loadStaffContext } from "@/lib/services/staff";
import { hasAccess, type AdminArea, type StaffAccessLevel } from "@/lib/staff-permissions";

const loadAdmin = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin");

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  const staff = record?.isAdmin ? await loadStaffContext(user.id) : null;
  if (!record || !staff) redirect("/");
  return { record, staff };
});

/** Returns the admin's user record. Redirects away when they may not open `area`. */
export async function requireAdminPage(area?: AdminArea | null, level: StaffAccessLevel = "view") {
  const { record, staff } = await loadAdmin();
  if (area && !hasAccess(staff, area, level)) redirect("/admin");
  return record;
}

/** Same check, but hands back the staff context (role + grants) for pages that need it. */
export async function requireStaffPage(area?: AdminArea | null, level: StaffAccessLevel = "view") {
  const { staff } = await loadAdmin();
  if (area && !hasAccess(staff, area, level)) redirect("/admin");
  return staff;
}
