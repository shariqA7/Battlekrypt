import { getTournamentById, getStandings } from "@/lib/services/tournaments";
import { countryName } from "@/lib/geo-data";
import { toPublicTournament } from "@/lib/services/venue";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { buildRail, ctaFor, eventDateRange } from "@/lib/tournament-view";
import CheckInPanel from "./CheckInPanel";
import RoomReveal from "./RoomReveal";
import FlagButton from "./FlagButton";
import Standings from "./Standings";
import TrackView from "./TrackView";
import VoteWidget from "./VoteWidget";
import StageRail from "@/components/tournaments/StageRail";
import PrizeDistribution from "@/components/tournaments/PrizeDistribution";
import OrganizerCard from "@/components/tournaments/OrganizerCard";
import RuleCard from "@/components/tournaments/RuleCard";
import LocalDate from "@/components/ui/LocalDate";
import AdSlot from "@/components/ui/AdSlot";
import { TierBadge, Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Eyebrow, SectionHeading } from "@/components/ui/Panel";
import { CalendarIcon, CoinIcon } from "@/components/ui/icons";
import { notFound } from "next/navigation";

const label = (v: string) => v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [full, standings] = await Promise.all([getTournamentById(id), getStandings(id)]);

  if (!full) notFound();
  // Room credentials and the check-in code never reach the page: they are
  // served only through their own access-checked endpoints.
  const tournament = toPublicTournament(full);
  const eventsHosted = await prisma.tournament.count({
    where: { organizerId: tournament.organizerId, status: "completed" },
  });

  const range = eventDateRange(tournament, tournament.stages);
  const rail = buildRail(tournament, tournament.stages);
  const cta = ctaFor(tournament, tournament._count.registrations);
  const hasPrize = !!tournament.prizePoolAmount;
  const prizeCurrency = tournament.prizePoolCurrency ?? "PKR";

  return (
    <>
      <TrackView tournamentId={tournament.id} />
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        {/* ---------------- hero ---------------- */}
        <header className="relative pt-10 sm:pt-14 pb-10 sm:pb-12 border-b border-bk-border">
          {tournament.bannerUrl && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tournament.bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 -z-10" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bk-bg via-bk-bg/90 to-bk-bg/30" />
            </>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
            <TierBadge tier={tournament.competitiveTier} />
            {range && (
              <span className="inline-flex items-center gap-2 font-mono text-[14px] text-bk-body">
                <CalendarIcon size={16} />
                <LocalDate iso={range.from.toISOString()} />
                {range.to && (
                  <>
                    {" – "}
                    <LocalDate iso={range.to.toISOString()} />
                  </>
                )}
              </span>
            )}
            {tournament.status === "in_progress" && <Badge tone="live">Live now</Badge>}
            {tournament.venueType === "lan" && <Badge tone="neutral">LAN · {tournament.venueCity}</Badge>}
            {tournament.venueType === "hybrid" && <Badge tone="neutral">Hybrid · online + LAN</Badge>}
            {tournament.audienceScope === "institution" && <Badge tone="amber">Students only</Badge>}
            {tournament.minAge > 13 && <Badge tone="amber">{tournament.minAge}+ only</Badge>}
            {tournament.country && <Badge tone="neutral">{countryName(tournament.country)}</Badge>}
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0">
              <h1 className="font-sans font-extrabold text-[38px] leading-[1.05] sm:text-6xl lg:text-[68px] tracking-tight text-bk-gold-light break-words">
                {tournament.name}
              </h1>
              {tournament.description && (
                <p className="mt-5 max-w-3xl font-sans text-[17px] sm:text-[20px] leading-relaxed text-bk-body">{tournament.description}</p>
              )}

              <dl className="mt-7 flex flex-wrap gap-x-9 gap-y-4">
                {[
                  ["Game", tournament.game.name],
                  ["Mode", label(tournament.mode)],
                  ["Format", label(tournament.format)],
                  [
                    "Entry fee",
                    tournament.entryType === "free"
                      ? "Free"
                      : tournament.entryFeeAmount
                        ? formatMoney(tournament.entryFeeAmount, tournament.entryFeeCurrency ?? "PKR")
                        : "—",
                  ],
                  ["Teams", `${tournament._count.registrations}/${tournament.maxTeams}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>
                      <Eyebrow className="text-bk-muted">{k}</Eyebrow>
                    </dt>
                    <dd className="mt-1 font-mono text-[16px] text-bk-heading">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:text-right">
              {hasPrize && (
                <>
                  <Eyebrow>Total prize pool</Eyebrow>
                  <p className="mt-2 flex items-center lg:justify-end gap-3 font-mono font-bold text-[34px] sm:text-[48px] leading-none text-bk-gold">
                    <CoinIcon size={32} className="shrink-0" />
                    <span>{formatMoney(tournament.prizePoolAmount!, prizeCurrency)}</span>
                  </p>
                </>
              )}
              <div className={hasPrize ? "mt-6" : ""}>
                {cta.kind === "join" ? (
                  <ButtonLink href={`/tournaments/${tournament.slug}/join`} size="lg" className="w-full lg:w-auto lg:min-w-[260px]">
                    {cta.label}
                  </ButtonLink>
                ) : (
                  <p className="inline-flex items-center justify-center w-full lg:w-auto lg:min-w-[260px] h-[52px] px-8 border border-bk-border font-sans font-bold text-[14px] uppercase tracking-[1.2px] text-bk-muted">
                    {cta.label}
                  </p>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ---------------- body ---------------- */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] py-10 sm:py-12">
          <div className="min-w-0 flex flex-col gap-10">
            <section aria-labelledby="stages-h">
              <SectionHeading>
                <span id="stages-h">Tournament stages</span>
              </SectionHeading>
              <div className="mt-5">
                <StageRail nodes={rail} />
              </div>
            </section>

            {tournament.venueType === "lan" ? (
              <section>
                <div className="border border-bk-border bg-bk-surface p-5">
                  <Eyebrow>Venue (LAN)</Eyebrow>
                  <p className="mt-2 font-sans font-bold text-[18px] text-bk-heading break-words">{tournament.venueName}</p>
                  <p className="font-sans text-[14px] text-bk-body break-words">
                    {[tournament.venueAddress, tournament.venueCity].filter(Boolean).join(", ")}
                  </p>
                  <p className="mt-3 font-sans text-[13px] text-bk-muted">
                    No room code for this event: show up and check in at the venue.
                  </p>
                </div>
                <div className="mt-4">
                  <CheckInPanel tournamentId={tournament.id} />
                </div>
              </section>
            ) : tournament.venueType === "hybrid" ? (
              <section className="flex flex-col gap-4">
                {tournament.stages
                  .filter((s) => s.venueType === "lan")
                  .map((s) => (
                    <div key={s.id}>
                      <div className="border border-bk-border bg-bk-surface p-5">
                        <Eyebrow>{s.name} · LAN</Eyebrow>
                        <p className="mt-2 font-sans font-bold text-[18px] text-bk-heading break-words">{s.venueName}</p>
                        <p className="font-sans text-[14px] text-bk-body break-words">
                          {[s.venueAddress, s.venueCity].filter(Boolean).join(", ")}
                        </p>
                        <p className="mt-3 font-sans text-[13px] text-bk-muted">Only entries that advance to this stage play it, in person.</p>
                      </div>
                      <div className="mt-3">
                        <CheckInPanel tournamentId={tournament.id} stageId={s.id} title={`${s.name} check-in`} />
                      </div>
                    </div>
                  ))}
                <RoomReveal stages={tournament.stages.filter((s) => s.venueType !== "lan")} />
              </section>
            ) : (
              <RoomReveal stages={tournament.stages} />
            )}

            {tournament.rules.length > 0 && (
              <section aria-labelledby="rules-h">
                <SectionHeading>
                  <span id="rules-h">Rules &amp; conduct</span>
                </SectionHeading>
                <ul className="mt-5 flex flex-col gap-4">
                  {tournament.rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      title={rule.title}
                      description={rule.description}
                      action={rule.action}
                      penaltyPoints={rule.penaltyPoints}
                      stageName={rule.appliesToStage?.name ?? null}
                    />
                  ))}
                </ul>
              </section>
            )}

            <Standings standings={standings} />

            <div className="flex flex-wrap items-center justify-between gap-4">
              <VoteWidget tournamentId={tournament.id} />
              <FlagButton tournamentId={tournament.id} />
            </div>
          </div>

          <aside className="min-w-0 flex flex-col gap-6 lg:self-start">
            <PrizeDistribution tiers={tournament.prizeTiers} currency={prizeCurrency} />
            <OrganizerCard
              id={tournament.organizer.id}
              name={tournament.organizer.orgName}
              avatarUrl={tournament.organizer.user.avatarUrl ?? null}
              verified={tournament.organizerVerified}
              eventsHosted={eventsHosted}
            />
            <AdSlot placement="tournament_detail" />
          </aside>
        </div>
      </main>
    </>
  );
}
