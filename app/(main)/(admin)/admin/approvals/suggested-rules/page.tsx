import { requireAdminPage } from "@/lib/admin-page";
import { listAllSuggestedRules } from "@/lib/services/rules";
import SuggestedRulesManager from "../../SuggestedRulesManager";

export default async function ApprovalsSuggestedRulesPage() {
  await requireAdminPage();
  const suggestedRules = await listAllSuggestedRules();
  return <SuggestedRulesManager initialRules={suggestedRules} />;
}
