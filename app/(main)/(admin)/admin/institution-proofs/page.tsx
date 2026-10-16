import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { listInstitutionProofs } from "@/lib/services/institution-proofs";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { Button, ButtonLink } from "@/components/ui/Button";
import AdminProofLink from "./AdminProofLink";

const STATUSES = ["pending", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export default async function AdminInstitutionProofsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const { rows, total, page, pages } = await listInstitutionProofs({
    q: sp.q,
    status,
    page: Number(sp.page) || 1,
  });

  const link = (p: number) => {
    const qs = new URLSearchParams();
    if (sp.q) qs.set("q", sp.q);
    if (status) qs.set("status", status);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/institution-proofs${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading">Student ID photos</h1>
      <p className="font-sans text-[13px] text-bk-muted">
        Fresh ID photos that players attach to institution-only tournament entries. Open one only when a
        dispute needs it: every view is recorded in the admin action log.
      </p>

      <form className="flex flex-wrap gap-2 items-center" action="/admin/institution-proofs">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Tournament, institute, player or e-mail"
          className="flex-1 min-w-[200px] bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[44px] sm:h-[38px]"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit">Search</Button>
      </form>

      <p className="font-sans text-[12px] text-bk-muted">
        {total} entr{total === 1 ? "y" : "ies"} with an ID photo
      </p>
      {rows.length === 0 && <p className="font-sans text-[13px] text-bk-muted">Nothing found.</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <Panel key={r.id} className="p-4 font-sans text-[13px]">
            <p className="text-bk-heading font-bold break-words flex flex-wrap items-center gap-2">
              {r.entrant}
              <Badge tone={r.status === "approved" ? "teal" : r.status === "rejected" ? "danger" : "amber"}>
                {r.status}
              </Badge>
            </p>
            <p className="text-bk-muted break-words">
              <Link href={`/tournaments/${r.tournament.id}`} className="underline">
                {r.tournament.name}
              </Link>
              {r.institute ? ` · ${r.institute}` : ""}
              {r.email ? ` · ${r.email}` : ""}
            </p>
            <p className="text-bk-muted text-[11px] mt-1">Entered {r.registeredAt.toLocaleString()}</p>
            <div className="mt-3">
              <AdminProofLink registrationId={r.id} />
            </div>
          </Panel>
        ))}
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 font-sans text-[12px] text-bk-muted">
          {page > 1 && (
            <ButtonLink href={link(page - 1)} variant="outline" size="sm">
              Previous
            </ButtonLink>
          )}
          <span>
            Page {page} of {pages}
          </span>
          {page < pages && (
            <ButtonLink href={link(page + 1)} variant="outline" size="sm">
              Next
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}
