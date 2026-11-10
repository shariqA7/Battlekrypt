import { requireAdminPage } from "@/lib/admin-page";
import { listCarouselSlides } from "@/lib/services/tournaments";
import { getBranding } from "@/lib/services/branding";
import BrandingManager from "../../BrandingManager";

export default async function SettingsBrandingPage() {
  await requireAdminPage("settings");
  const [b, slides] = await Promise.all([getBranding(), listCarouselSlides()]);
  return (
    <BrandingManager
      initialAssets={{
        logoUrl: b.logoUrl ?? "",
        logoLightUrl: b.logoLightUrl ?? "",
        shareImageUrl: b.shareImageUrl ?? "",
        defaultBannerUrl: b.defaultBannerUrl ?? "",
        defaultAvatarUrl: b.defaultAvatarUrl ?? "",
        defaultOrgLogoUrl: b.defaultOrgLogoUrl ?? "",
        defaultClubLogoUrl: b.defaultClubLogoUrl ?? "",
      }}
      initialSlides={slides}
    />
  );
}
