import { requireAdminPage } from "@/lib/admin-page";
import { getLoginOptions } from "@/lib/services/login-options";
import LoginOptionsSettings from "../../LoginOptionsSettings";

export default async function SettingsLoginPage() {
  await requireAdminPage();
  const loginOptions = await getLoginOptions();
  return <LoginOptionsSettings initialTwitch={loginOptions.twitch} />;
}
