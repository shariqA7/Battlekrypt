import Link from "next/link";
import { listUpcomingFeatured } from "@/lib/services/featured";

// The admin's hand-picked upcoming tournaments, shown under the carousel.
export default async function FeaturedTournaments() {
  const items = await listUpcomingFeatured();
  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">Featured tournaments</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/tournaments/${t.slug}`}
            className="bg-bk-surface border border-bk-border hover:border-bk-gold-light overflow-hidden block"
          >
            {t.bannerUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.bannerUrl} alt="" className="h-28 w-full object-cover" />
            )}
            <div className="p-3">
              <p className="font-sans font-bold text-[14px] text-bk-heading">{t.name}</p>
              <p className="font-sans text-[12px] text-bk-muted mt-0.5">
                {t.gameName} · {t.organizerName}
              </p>
              {t.startAt && (
                <p className="font-mono text-[12px] text-bk-gold-light mt-1">
                  {t.startAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
