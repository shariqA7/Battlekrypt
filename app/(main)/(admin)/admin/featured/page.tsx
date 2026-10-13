import { requireAdminPage } from "@/lib/admin-page";
import { SectionHeading } from "@/components/ui/Panel";
import {
  listAllSlides,
  listEligibleOwners,
  listFeaturableTournaments,
  listFeaturedForAdmin,
} from "@/lib/services/featured";
import FeaturedManager from "../FeaturedManager";

export default async function AdminFeaturedPage() {
  await requireAdminPage();
  const [slides, owners, featured, featurable] = await Promise.all([
    listAllSlides(),
    listEligibleOwners(),
    listFeaturedForAdmin(),
    listFeaturableTournaments(),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <SectionHeading>Featured</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          The dashboard carousel and the upcoming-tournaments list.
        </p>
      </div>
      <FeaturedManager
        slides={slides}
        owners={owners}
        featured={featured}
        featurable={featurable}
      />
    </div>
  );
}
