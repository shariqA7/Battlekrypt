import { requireAdminPage } from "@/lib/admin-page";
import { listConsentCases } from "@/lib/services/consent-cases";
import ConsentCases from "../../ConsentCases";

export default async function ApprovalsConsentPage() {
  await requireAdminPage();
  const [open, decided] = await Promise.all([listConsentCases("open"), listConsentCases("decided")]);
  return <ConsentCases open={open} decided={decided} />;
}
