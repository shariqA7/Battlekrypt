import { requireAdminPage } from "@/lib/admin-page";
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
        <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Featured</h1>
        <p className="font-sans text-[13px] text-bk-body">
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
