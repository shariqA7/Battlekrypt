import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// Organizer features stay locked while an organization's application is
// under review or has been rejected: those accounts are sent to the status
// page instead. Organizers who joined before applications existed have no
// application row, so they pass straight through.
export default async function OrganizerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const application = await prisma.organizationApplication.findUnique({
      where: { userId: user.id },
      select: { status: true },
    });
    if (application && application.status !== "approved") {
      redirect("/organizer/application");
    }
  }

  return <>{children}</>;
}
