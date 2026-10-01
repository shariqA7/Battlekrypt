import DashboardCarousel from "./DashboardCarousel";
import FeaturedTournaments from "./FeaturedTournaments";
import { listVisibleSlides } from "@/lib/services/featured";

// Carousel + featured tournaments, placed at the very top of every dashboard.
export default async function DashboardTop() {
  const slides = await listVisibleSlides();
  return (
    <>
      <DashboardCarousel slides={slides} />
      <FeaturedTournaments />
    </>
  );
}
