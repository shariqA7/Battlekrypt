import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { listPendingOrganizers, listPendingGameRequests, listFlaggedTournaments } from "@/lib/services/tournaments";
import { redirect } from "next/navigation";
import AdminQueues from "./AdminQueues";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?redirectTo=/admin");

  const userRecord = await prisma.user.findUnique({ where: { id: user.id } });
  if (!userRecord?.isAdmin) redirect("/");

  const [pendingOrganizers, pendingGameRequests, flaggedTournaments] = await Promise.all([
    listPendingOrganizers(),
    listPendingGameRequests(),
    listFlaggedTournaments(),
  ]);

  return (
    <>
      <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">
          Admin
        </h1>
        <AdminQueues
          initialOrganizers={pendingOrganizers}
          initialGameRequests={pendingGameRequests}
          initialFlags={flaggedTournaments.map((t) => ({
            ...t,
            flags: t.flags.map((f) => ({
              id: f.id,
              reason: f.reason,
              createdAt: f.createdAt.toISOString(),
            })),
          }))}
        />
      </main>
    </>
  );
}
