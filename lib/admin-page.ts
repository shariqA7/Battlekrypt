// Every admin PAGE calls this first. A layout alone isn't enough: Next.js
// doesn't re-run layouts on client-side navigation, so each page has to
// verify the admin itself before loading any data.
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const requireAdminPage = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/admin");

  const record = await prisma.user.findUnique({ where: { id: user.id } });
  if (!record?.isAdmin) redirect("/");
  return record;
});
