import type { Metadata } from "next";
import Link from "next/link";
import { previewMetadata, blurb } from "@/lib/link-preview";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getFeatureFlags } from "@/lib/services/feature-flags";
import { getGiveawayPage } from "@/lib/services/giveaways";
import FeatureOffNotice from "@/components/ui/FeatureOffNotice";
import LocalDate from "@/components/ui/LocalDate";
import EnterPanel from "./EnterPanel";
import WinnerPanel from "./WinnerPanel";

const KIND: Record<string, string> = { physical: "Physical prize, delivered to you", code: "Digital code or gift card", cash: "Cash prize (18+)" };

// Link preview: the prize photo when there is one, otherwise the platform picture.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const g = await getGiveawayPage(slug, null);
    if (!g) return {};
    return await previewMetadata({
      title: `Giveaway: ${g.prizeTitle}`,
      description: blurb(g.description, "Enter this giveaway on BattleKrypt."),
      image: g.prizeImageUrl,
    });
  } catch {
    return {};
  }
}

export default async function GiveawayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await getFeatureFlags()).giveaways) return <FeatureOffNotice title="Giveaways are paused">Giveaways aren&apos;t available right now.</FeatureOffNotice>;

  const me = user ? await prisma.user.findUnique({ where: { id: user.id }, select: { isAdmin: true } }) : null;
  const g = await getGiveawayPage(slug, user ? { id: user.id, isAdmin: me?.isAdmin ?? false } : null);
  if (!g) notFound();

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <Link href="/giveaways" className="font-sans text-[12px] text-bk-gold-light hover:underline">← All giveaways</Link>

      {g.prizeImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={g.prizeImageUrl} alt={g.prizeTitle} className="w-full max-h-72 object-cover border border-bk-border mt-3" />
      )}
      <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mt-4">
        {g.host.sponsor ? (
          <>Presented by {g.host.sponsor.url ? <a href={g.host.sponsor.url} target="_blank" rel="noopener noreferrer sponsored" className="underline">{g.host.sponsor.name}</a> : g.host.sponsor.name} · </>
        ) : null}
        Run by {g.host.name}
      </p>
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mt-1">{g.title}</h1>
      <p className="font-sans text-[15px] text-bk-heading mt-1">{g.prizeTitle}{g.prizeValueUsd !== null && <span className="text-bk-muted"> · worth about ${g.prizeValueUsd}</span>}</p>

      <div className="flex flex-wrap gap-1.5 mt-3 font-sans text-[11px]">
        <span className="border border-bk-border px-2 py-0.5 text-bk-body">{KIND[g.prizeKind]}</span>
        <span className="border border-bk-border px-2 py-0.5 text-bk-body">{g.winnersCount} winner{g.winnersCount === 1 ? "" : "s"}</span>
        <span className="border border-bk-border px-2 py-0.5 text-bk-body">{g.entries} entr{g.entries === 1 ? "y" : "ies"}</span>
        {g.verifiedOnly && <span className="border border-bk-gold-light/60 px-2 py-0.5 text-bk-gold-light">Verified members only</span>}
      </div>

      <p className="font-sans text-[13px] text-bk-body mt-4">
        {g.phase === "upcoming" ? <>Starts <LocalDate iso={g.startsAt} format="long" /> · ends <LocalDate iso={g.endsAt} format="long" /></> : g.phase === "drawn" ? <>Drawn{g.drawnAt && <> on <LocalDate iso={g.drawnAt} format="long" /></>}</> : <>Ends <LocalDate iso={g.endsAt} format="long" /></>}
      </p>
      {g.status === "cancelled" && <p className="font-sans text-[13px] text-bk-live mt-3" role="status">This giveaway was cancelled{g.cancelledNote ? `: ${g.cancelledNote}` : "."}</p>}
      {(g.status === "pending_review" || g.status === "draft" || g.status === "rejected") && (
        <p className="font-sans text-[13px] text-bk-gold-light mt-3" role="status">
          {g.status === "pending_review" ? "Waiting for an admin to approve it. Only you can see this page." : g.status === "draft" ? "This is a draft. Only admins can see it." : `Not approved${g.reviewNote ? `: ${g.reviewNote}` : "."}`}
        </p>
      )}

      <section className="mt-6 whitespace-pre-line font-sans text-[13px] text-bk-body" aria-label="Details and rules">{g.description}</section>
      {g.tournament && <p className="font-sans text-[12px] text-bk-muted mt-3">Only players who took part in <Link href={`/tournaments/${g.tournament.slug}`} className="underline">{g.tournament.name}</Link> can enter.</p>}

      {g.myWin ? (
        <WinnerPanel win={g.myWin} slug={g.slug} />
      ) : (
        g.status === "active" && <EnterPanel giveawayId={g.id} slug={g.slug} entered={g.entered} eligibility={g.eligibility} verifiedOnly={g.verifiedOnly} tournament={g.tournament} />
      )}

      {g.winners.length > 0 && (
        <section className="mt-8" aria-label="Winners">
          <h2 className="font-sans font-bold text-[15px] text-bk-heading mb-2">Winners</h2>
          <ul className="font-sans text-[13px] text-bk-body space-y-1">
            {g.winners.map((w) => <li key={w.id}>{w.name}{w.delivered && <span className="text-bk-teal"> · prize received ✓</span>}</li>)}
          </ul>
        </section>
      )}

      {g.manage && (
        <p className="font-sans text-[12px] text-bk-muted mt-8">
          You run this giveaway. <Link href={me?.isAdmin ? "/admin/giveaways" : "/organizer/dashboard/giveaways"} className="text-bk-gold-light underline">Manage it</Link>
        </p>
      )}
    </main>
  );
}
