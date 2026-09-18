// Shared helper: confirms the caller is an authenticated admin.
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requireAdmin() {
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

  if (!userRecord?.isAdmin) {
    return {
      response: NextResponse.json(
        { error: { code: "forbidden", message: "Admin access required." } },
        { status: 403 }
      ),
    } as const;
  }

  return { admin: userRecord } as const;
}
