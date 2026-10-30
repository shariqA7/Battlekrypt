// Shared helper: confirms the caller is an authenticated admin AND may use this area.
//
//   requireAdmin()                    any active staff member (the dashboard)
//   requireAdmin("payments", "view")  can read payments
//   requireAdmin("payments")          can change payments (edit is the default, the safe side)
//   requireAdmin("staff")             super admin only
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { loadStaffContext } from "@/lib/services/staff";
import { hasAccess, type AdminArea, type StaffAccessLevel } from "@/lib/staff-permissions";

export async function requireAdmin(area?: AdminArea | null, level: StaffAccessLevel = "edit") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: { code: "unauthenticated", message: "Sign in required." } },
        { status: 401 }
      ),
    } as const;
  }

  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  const staff = userRecord?.isAdmin ? await loadStaffContext(user.id) : null;

  if (!userRecord || !staff) {
    return {
      response: NextResponse.json(
        { error: { code: "forbidden", message: "Admin access required." } },
        { status: 403 }
      ),
    } as const;
  }

  if (area && !hasAccess(staff, area, level)) {
    return {
      response: NextResponse.json(
        { error: { code: "no_permission", message: "You don't have permission to do that." } },
        { status: 403 }
      ),
    } as const;
  }

  return { admin: userRecord, staff } as const;
}
