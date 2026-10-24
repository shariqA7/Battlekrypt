import { requireAdminPage } from "@/lib/admin-page";
import { listPendingIdentity, listStoredIdentityImages } from "@/lib/services/identity";
import IdentityChecks from "./IdentityChecks";

export default async function ApprovalsIdentityPage() {
  await requireAdminPage();
  const [pending, stored] = await Promise.all([listPendingIdentity(), listStoredIdentityImages()]);
  return <IdentityChecks pending={pending} stored={stored} />;
}
