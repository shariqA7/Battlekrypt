import { requireStaffPage } from "@/lib/admin-page";
import { listStaff } from "@/lib/services/staff";
import { SectionHeading } from "@/components/ui/Panel";
import StaffManager from "@/components/admin/StaffManager";

// Super admin only: the team list, and what each person can open.
export default async function AdminStaffPage() {
  const me = await requireStaffPage("staff");
  const staff = await listStaff();
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Staff</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">Add admins and managers, and choose exactly what each of them can see and change.</p>
      </div>
      <StaffManager initial={staff} meId={me.userId} />
    </div>
  );
}
