import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { getOrganizationDetail } from "@/lib/services/admin-organization-detail";
import AutoRenewToggle from "./AutoRenewToggle";
import ChangePlanPanel from "./ChangePlanPanel";
import { listPlans } from "@/lib/services/plan-requests";
import { formatMoney } from "@/lib/money";
import { DOC_LABEL, type DocType } from "@/lib/identity";
import { REPORT_KIND_LABEL, type ReportKindT } from "@/lib/report-kinds";
import { ColumnChart, Stat, Panel } from "@/components/admin/charts";
import InitialTile from "@/components/ui/InitialTile";
import Avatar from "@/components/ui/Avatar";
import BanUserButton from "../../BanUserButton";
import AssignPlan from "../AssignPlan";
import KycPanel from "./KycPanel";

const date = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (r: Record<string, number>) => {
  const parts = Object.entries(r).filter(([, v]) => v !== 0).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
};
const label = (s: string) => s.replace(/_/g, " ");

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 font-sans text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-bk-muted">{k}</dt>
          <dd className="text-bk-heading break-words">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "good" | "warn" | "bad" }) {
  const c = { plain: "border-bk-border text-bk-body", good: "border-bk-teal/50 text-bk-teal", warn: "border-bk-gold-light/60 text-bk-gold-light", bad: "border-bk-live/60 text-bk-live" }[tone];
  return <span className={`inline-block border px-2 py-0.5 font-sans text-[11px] ${c}`}>{children}</span>;
}

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage("organizations");
  const { id } = await params;
  const [o, allPlans] = await Promise.all([getOrganizationDetail(id), listPlans({ audience: "organizer", activeOnly: true })]);
  if (!o) notFound();
  const plans = allPlans.map((p) => ({ code: p.code, name: p.name, isPaid: p.isPaid, isActive: p.isActive }));
  const isInst = o.type === "institute";
  const idTone = o.identity?.state === "approved" ? "good" : o.identity?.state === "pending" ? "warn" : o.identity ? "bad" : "plain";

  const alerts: string[] = [];
  if (o.owner.ban) alerts.push(`The owner's account is banned: ${o.owner.ban.reason}`);
  if (o.trust.paused) alerts.push(`New paid events are paused after player reports${o.trust.paused.reason ? `: ${o.trust.paused.reason}` : ""}.`);
  for (const h of o.trust.holds) alerts.push(`Payout hold on “${h.name}”: ${h.reason}`);
  if (o.plan.state === "expired") alerts.push("The paid plan has expired, so the organization is on Free limits.");
  if (isInst && o.institute && !o.institute.verified) alerts.push("This institute is not verified yet, so it can't host institution-only tournaments.");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-bk-surface border border-bk-border p-5">
        <div className="flex flex-wrap items-start gap-4">
          <InitialTile name={o.name} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-sans font-bold text-[24px] text-bk-heading break-words">{o.name}</h1>
              <Chip>{isInst ? "Institute" : "Organization"}</Chip>
              {isInst && <Chip tone={o.institute?.verified ? "good" : "warn"}>{o.institute?.verified ? "Verified institute" : "Unverified"}</Chip>}
              <Chip tone={o.plan.state === "expired" ? "bad" : o.plan.isPaid ? "warn" : "plain"}>{o.plan.name}</Chip>
              <Chip tone={idTone}>Identity: {o.identity ? label(o.identity.state) : "not checked"}</Chip>
            </div>
            <p className="font-sans text-[12px] text-bk-muted mt-1">
              Joined {date(o.joinedAt)}
              {o.addedByAdmin && <> · added by {o.addedByAdmin}</>}
            </p>
            <div className="flex items-center gap-2.5 mt-3">
              <Avatar src={o.owner.avatarUrl} name={o.owner.name} size={36} />
              <div className="min-w-0 font-sans text-[12px]">
                <p className="text-bk-heading truncate">{o.owner.name}</p>
                <p className="text-bk-muted truncate">
                  {o.owner.email}
                  {o.owner.phone && ` · ${o.owner.phone}`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 min-w-[220px]">
            <AssignPlan organizerId={o.id} currentPlan={o.plan.code} plans={plans} />
            <AutoRenewToggle organizerId={o.id} initial={o.plan.autoRenew} hasPaidPlan={o.plan.isPaid} />
            {o.plan.isPaid && o.plan.state !== "expired" && (
              <ChangePlanPanel organizerId={o.id} plans={plans.filter((p) => p.isPaid && p.isActive && p.code !== o.plan.code).map((p) => ({ code: p.code, name: p.name }))} />
            )}
            {!o.owner.ban && <BanUserButton userId={o.owner.id} name={o.owner.name} />}
            <div className="flex gap-3 font-sans text-[11px] uppercase tracking-[0.8px]">
              <Link href="/admin/organizer-trust" className="text-bk-gold-light underline">Organizer trust</Link>
              <Link href="/admin/reports" className="text-bk-gold-light underline">Reports</Link>
            </div>
          </div>
        </div>
        {alerts.length > 0 && (
          <ul className="mt-4 space-y-1.5" aria-label="Needs attention">
            {alerts.map((a) => (
              <li key={a} className="border border-bk-live/50 bg-bk-live/10 px-3 py-2 font-sans text-[12px] text-bk-heading">{a}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Tournaments hosted" value={o.tournaments.total} hint={`${o.tournaments.paid} paid-entry`} />
        <Stat label="Players reached" value={o.players.unique} hint={`${o.players.registrations} registrations`} />
        <Stat label="Entry fees collected" value={money(o.money.earned)} hint="paid registrations" />
        <Stat label="Prize pool announced" value={money(o.money.prizePool)} hint={`Sent to winners: ${money(o.money.prizeSent)}`} />
        <Stat label="Payouts confirmed" value={o.payouts.confirmationRate === null ? "—" : `${o.payouts.confirmationRate}%`} hint={`${o.payouts.confirmed} of ${o.payouts.total} · ${o.payouts.disputed} disputed`} />
        <Stat label="Complaints" value={o.complaints.total} hint={`${o.complaints.open} open · ${o.complaints.upheld} upheld`} />
        <Stat label="Challenges hosted" value={o.challenges.total} hint={`${o.challenges.applications} applications`} />
        <Stat label="Paid to the platform" value={money(o.paidToPlatform.totals)} hint="plan payments" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Profile and contact">
          <Facts
            rows={[
              ["Kind", o.details.orgType],
              ["Registration number", o.details.registrationNumber],
              ["Country", o.details.country],
              ["City", o.details.city],
              ["Address", o.details.address],
              ["Contact email", o.details.contactEmail],
              ["Contact phone", o.details.contactPhone],
              ["Website", o.details.website ? <a key="w" href={o.details.website} target="_blank" rel="noopener noreferrer" className="text-bk-gold-light underline">{o.details.website}</a> : null],
            ]}
          />
          {(o.details.bio || o.details.description) && <p className="font-sans text-[12px] text-bk-body mt-4 whitespace-pre-line">{o.details.bio ?? o.details.description}</p>}
          {o.details.handler && (
            <p className="font-sans text-[12px] text-bk-muted mt-3">
              Handler on the application: {o.details.handler.name} ({o.details.handler.role}), {o.details.handler.phone}
            </p>
          )}
          <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Owner’s account</p>
          <Facts
            rows={[
              ["Name", o.owner.name],
              ["Username", o.owner.profile?.username],
              ["Email", o.owner.email],
              ["Phone", o.owner.phone],
              ["Country", o.owner.profile?.country],
              ["City", o.owner.profile?.city],
              ["Age", o.owner.profile?.age],
              ["Account since", date(o.owner.joinedAt)],
              ["Last seen", o.owner.lastSeen ? `${date(o.owner.lastSeen.at)} · ${o.owner.lastSeen.device}${o.owner.lastSeen.country ? ` · ${o.owner.lastSeen.country}` : ""}` : null],
            ]}
          />
          {o.members.length > 0 && (
            <>
              <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Team ({o.members.length})</p>
              <ul className="font-sans text-[12px] text-bk-body space-y-0.5">
                {o.members.map((m) => (
                  <li key={m.id}>{m.name ?? m.email} <span className="text-bk-muted">· {m.role}{m.name ? ` · ${m.email}` : ""}</span></li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Identity check (KYC)">
          {o.identity ? (
            <>
              <Facts
                rows={[
                  ["Status", <Chip key="s" tone={idTone}>{label(o.identity.state)}</Chip>],
                  ["Document", DOC_LABEL[o.identity.docType as DocType]],
                  ["Name on document", o.identity.fullName],
                  ["Submitted", date(o.identity.submittedAt)],
                  ["Reviewed", date(o.identity.reviewedAt)],
                  ["Valid until", date(o.identity.validUntil)],
                  ["Attempts", o.identity.attempts],
                  ["Photos", o.identity.photosDeletedAt ? `Deleted ${date(o.identity.photosDeletedAt)}` : o.identity.photosUntil ? `Kept until ${date(o.identity.photosUntil)}${o.identity.retentionHold ? " (held)" : ""}` : "Stored"],
                ]}
              />
              {o.identity.rejectionNote && <p className="font-sans text-[12px] text-bk-live mt-3">Rejected: {o.identity.rejectionNote}</p>}
              {o.identity.state === "pending" && (
                <p className="font-sans text-[12px] mt-3">
                  Waiting for review: <Link href="/admin/approvals/identity" className="text-bk-gold-light underline">Approvals → Identity checks</Link>
                </p>
              )}
            </>
          ) : (
            <p className="font-sans text-[13px] text-bk-muted">No identity check yet. The organizer can verify from their dashboard, and starter limits apply until they do.</p>
          )}
          <div className="mt-4">
            <KycPanel
              identityId={o.identity?.id ?? null}
              docType={(o.identity?.docType as DocType) ?? null}
              photos={o.identity && !o.identity.photosDeletedAt ? o.identity.photos : null}
              instituteId={o.institute?.id ?? null}
              hasProof={Boolean(o.institute?.hasProof)}
            />
          </div>
          {o.institute && (
            <>
              <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Institute</p>
              <Facts
                rows={[
                  ["Name", o.institute.name],
                  ["Kind", o.institute.kind],
                  ["Verified", o.institute.verified ? `Yes, ${date(o.institute.verifiedAt)}` : "No"],
                  ["Registration document", o.institute.hasProof ? "Uploaded" : "None"],
                  ["Players in it", o.institute.players],
                ]}
              />
              <p className="font-sans text-[12px] mt-2">
                <Link href="/admin/institutions" className="text-bk-gold-light underline">Verify or unverify on Institutions</Link>
              </p>
            </>
          )}
          <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Starter limits</p>
          <p className="font-sans text-[12px] text-bk-body">
            {o.trust.graduated
              ? `Lifted: ${[o.trust.limitsLifted && "by an admin", o.trust.identityVerified && "identity verified", o.trust.confirmedEvents >= o.trust.graduationEvents && "track record"].filter(Boolean).join(", ")}.`
              : `Active. ${o.trust.confirmedEvents} of ${o.trust.graduationEvents} prize events fully confirmed; ${o.trust.eventsNeeded} to go.`}
          </p>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Plan and payments">
          <Facts
            rows={[
              ["Plan", o.plan.name],
              ["Status", o.plan.state === "free" ? "Free" : o.plan.state === "no_expiry" ? "Active, no expiry" : o.plan.state === "expired" ? "Expired" : "Active"],
              ["Ends", o.plan.isPaid ? (o.plan.endsAt ? date(o.plan.endsAt) : "No expiry") : "—"],
              ["Price", o.plan.priceAmount !== null && o.plan.priceCurrency ? formatMoney(o.plan.priceAmount, o.plan.priceCurrency) : "Free"],
              ["Security deposit", o.plan.depositAmount !== null && o.plan.priceCurrency ? formatMoney(o.plan.depositAmount, o.plan.priceCurrency) : "—"],
            ]}
          />
          {o.plan.perks.length > 0 && (
            <ul className="mt-3 space-y-1">
              {o.plan.perks.map((p) => (
                <li key={p} className="font-sans text-[12px] text-bk-body flex gap-2"><span className="text-bk-teal" aria-hidden="true">✓</span>{p}</li>
              ))}
            </ul>
          )}
          <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">History</p>
          {o.plan.history.length === 0 ? (
            <p className="font-sans text-[12px] text-bk-muted">No plan changes yet.</p>
          ) : (
            <ul className="font-sans text-[12px] text-bk-body space-y-1">
              {o.plan.history.map((h, i) => (
                <li key={i}><span className="text-bk-muted">{date(h.at)}</span> · {h.text}</li>
              ))}
            </ul>
          )}
          {o.paidToPlatform.items.length > 0 && (
            <>
              <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Payments recorded</p>
              <ul className="font-sans text-[12px] text-bk-body space-y-1">
                {o.paidToPlatform.items.map((p) => (
                  <li key={p.id}><span className="text-bk-muted">{date(p.at)}</span> · {formatMoney(p.amount, p.currency)} · {p.method}</li>
                ))}
              </ul>
            </>
          )}
          {o.deposits.length > 0 && (
            <>
              <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Security deposits</p>
              <ul className="font-sans text-[12px] text-bk-body space-y-1">
                {o.deposits.map((d) => (
                  <li key={d.id}><span className="text-bk-muted">{date(d.at)}</span> · {formatMoney(d.amount, d.currency)} · {d.plan} · {label(d.status)}</li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Growth (last 6 months)">
          <p className="font-sans text-[12px] text-bk-muted mb-1">Tournaments created</p>
          <ColumnChart data={o.growth.map((g) => ({ label: g.month, value: g.tournaments }))} height={90} />
          <p className="font-sans text-[12px] text-bk-muted mt-4 mb-1">Registrations received</p>
          <ColumnChart data={o.growth.map((g) => ({ label: g.month, value: g.registrations }))} height={90} />
          <p className="font-sans font-bold text-[13px] text-bk-heading mt-5 mb-2">Tournaments by status</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(o.tournaments.byStatus).length === 0 ? <span className="font-sans text-[12px] text-bk-muted">None yet.</span> : Object.entries(o.tournaments.byStatus).map(([s, n]) => <Chip key={s}>{label(s)} · {n}</Chip>)}
          </div>
        </Panel>
      </div>

      <Panel title="Recent tournaments">
        {o.tournaments.recent.length === 0 ? (
          <p className="font-sans text-[12px] text-bk-muted">No tournaments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full font-sans text-[12px]">
              <thead className="text-bk-muted text-left uppercase tracking-[0.6px] text-[10px]">
                <tr><th className="py-2 pr-3">Name</th><th className="pr-3">Status</th><th className="pr-3">Entry</th><th className="pr-3">Prize pool</th><th className="pr-3">Registrations</th><th>Created</th></tr>
              </thead>
              <tbody className="divide-y divide-bk-border">
                {o.tournaments.recent.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3"><Link href={`/tournaments/${t.slug}`} className="text-bk-heading underline">{t.name}</Link></td>
                    <td className="pr-3">{label(t.status)}</td>
                    <td className="pr-3">{t.entry ? formatMoney(t.entry.amount, t.entry.currency) : "Free"}</td>
                    <td className="pr-3">{t.prize ? formatMoney(t.prize.amount, t.prize.currency) : "—"}</td>
                    <td className="pr-3">{t.registrations}</td>
                    <td className="text-bk-muted">{date(t.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Complaints from players">
          {o.complaints.total === 0 ? (
            <p className="font-sans text-[12px] text-bk-muted">No player has reported this organizer.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <Chip tone={o.complaints.open ? "warn" : "plain"}>{o.complaints.open} open</Chip>
                <Chip tone={o.complaints.upheld ? "bad" : "plain"}>{o.complaints.upheld} upheld</Chip>
                <Chip>{o.complaints.dismissed} dismissed</Chip>
              </div>
              <ul className="space-y-3">
                {o.complaints.recent.map((r) => (
                  <li key={r.id} className="font-sans text-[12px] border-l-2 border-bk-border pl-3">
                    <p className="text-bk-heading">{REPORT_KIND_LABEL[r.kind as ReportKindT] ?? label(r.kind)} <span className="text-bk-muted">· {label(r.status)}</span></p>
                    <p className="text-bk-body">{r.text}</p>
                    <p className="text-bk-muted">{r.reporter} · {r.tournament} · {date(r.at)}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        <Panel title="Challenges hosted">
          {o.challenges.total === 0 ? (
            <p className="font-sans text-[12px] text-bk-muted">No challenges posted.</p>
          ) : (
            <>
              <Facts rows={[["Posted", o.challenges.total], ["Applications received", o.challenges.applications], ["Prize value (USD)", `$${Math.round(o.challenges.prizeUsd).toLocaleString("en-US")}`]]} />
              <div className="flex flex-wrap gap-2 mt-3">
                {Object.entries(o.challenges.byStatus).map(([s, n]) => <Chip key={s}>{label(s)} · {n}</Chip>)}
              </div>
            </>
          )}
        </Panel>
      </div>

      <Panel title="Not tracked yet">
        <p className="font-sans text-[12px] text-bk-body">
          These are not recorded anywhere on the platform yet, so there is nothing to show: <strong>giveaways</strong>, <strong>donations</strong>, and <strong>ratings players give an organizer</strong>. Until they exist, the payout confirmation rate and the complaints above are the closest signals of how players find this organizer.
        </p>
      </Panel>

      <Panel title="Admin activity">
        {o.activity.length === 0 ? (
          <p className="font-sans text-[12px] text-bk-muted">Nothing logged.</p>
        ) : (
          <ul className="font-sans text-[12px] text-bk-body space-y-1">
            {o.activity.map((a) => (
              <li key={a.id}><span className="text-bk-muted">{date(a.at)}</span> · {a.action}{a.notes ? ` — ${a.notes}` : ""} <span className="text-bk-muted">· {a.by}</span></li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
