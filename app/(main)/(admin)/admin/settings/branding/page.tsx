import { requireAdminPage } from "@/lib/admin-page";
import { getSiteSettings, listCarouselSlides } from "@/lib/services/tournaments";
import BrandingManager from "../../BrandingManager";

export default async function SettingsBrandingPage() {
  await requireAdminPage();
  const [siteSettings, slides] = await Promise.all([getSiteSettings(), listCarouselSlides()]);
  return <BrandingManager initialLogoUrl={siteSettings.logoUrl ?? ""} initialSlides={slides} />;
}
