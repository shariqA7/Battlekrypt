import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSeriesPublic } from "@/lib/services/scrim-series";
import { previewMetadata, blurb } from "@/lib/link-preview";
import { formatMoney } from "@/lib/money";
import ShareLinks from "@/components/ui/ShareLinks";
import { Panel, SectionHeading } from "@/components/ui/Panel";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const d = await getSeriesPublic(slug);
    if (!d) return {};
    return await previewMetadata({ title: d.series.name, description: blurb(d.series.description, `${d.series.schedule}. Join a scrim on BattleKrypt.`), image: d.series.bannerUrl });
  } catch {
    return {};
  }
}

export default async function SeriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getSeriesPublic(slug);
  if (!data) notFound();
  const { series, sessions } = data;
  const tz = series.timezone;
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(d);
  const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

  const groups: { day: string; items: typeof sessions }[] = [];
  for (const s of sessions) {
    const day = dayKey(s.startAt);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(s); else groups.push({ day, items: [s] });
  }
  const fee = series.entryType === "paid" && series.entryFeeAmount !== null && series.entryFeeCurrency ? `${formatMoney(series.entryFeeAmount, series.entryFeeCurrency)} per session` : "Free";
  const stopped = series.status === "ended" ? "This series has ended." : series.status === "paused" ? "This series is paused for now." : null;

  return (
    <main className="flex-1 px-5 sm:px-6 py-10 max-w-3xl mx-auto w-full">
      {series.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={series.bannerUrl} alt="" className="w-full h-auto border border-bk-border mb-6" />
      )}
      <SectionHeading>{series.name}</SectionHeading>
      <p className="font-sans text-[13px] text-bk-body pl-[19px] mb-1">{series.game.name} · {series.mode === "solo" ? "Solo" : series.mode === "duo" ? "Duo" : "Squad"} · by {series.organizer.orgName}</p>
      <p className="font-sans text-[14px] text-bk-heading pl-[19px] mb-1">{series.schedule} <span className="text-bk-muted">({tz})</span></p>
      <p className="font-mono text-[13px] text-bk-body pl-[19px] mb-4">{fee}{series.endDate ? ` · until ${series.endDate.toISOString().slice(0, 10)}` : " · runs non-stop"}</p>
      {series.description && <p className="font-sans text-[13px] text-bk-body whitespace-pre-wrap mb-4">{series.description}</p>}
      {stopped && <p className="font-sans text-[13px] text-bk-live mb-4">{stopped}</p>}
      {series.mode !== "solo" && <p className="font-sans text-[12px] text-bk-muted mb-4">This is a team game. You enter with a club team. Creating a club is free.</p>}

      <ShareLinks path={`/s/${series.slug}`} title={`${series.name}: join the next scrim`} className="mb-8" />

      <h2 className="font-sans font-bold text-bk-heading text-[15px] mb-3">Upcoming sessions</h2>
      {groups.length === 0 && <p className="font-sans text-[13px] text-bk-muted">No sessions are open yet. Check back soon.</p>}
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.day}>
            <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-2">{g.day}</p>
            <div className="space-y-2">
              {g.items.map((s) => (
                <Panel key={s.id} className="p-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-[14px] text-bk-heading">{clock(s.startAt)}</p>
                    <p className="font-sans text-[12px] text-bk-muted">{s.full ? "Full" : `${s.capacity - s.taken} of ${s.capacity} spots left`}</p>
                  </div>
                  {s.open && !s.full
                    ? <Link href={`/tournaments/${s.slug}/join`} className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-4 py-2.5">Join</Link>
                    : <Link href={`/tournaments/${s.slug}`} className="border border-bk-border text-bk-heading font-sans text-[12px] px-4 py-2.5">{s.full ? "Full" : "View"}</Link>}
                </Panel>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
