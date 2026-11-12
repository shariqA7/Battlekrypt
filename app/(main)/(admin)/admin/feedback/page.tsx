import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { countFeedbackByStatus, listFeedbackForAdmin } from "@/lib/services/feedback";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL } from "@/lib/feedback-rules";
import { SectionHeading } from "@/components/ui/Panel";
import FeedbackManager from "./FeedbackManager";

export default async function AdminFeedbackPage({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  await requireAdminPage("feedback");
  const sp = await searchParams;
  const status = FEEDBACK_STATUSES.includes(sp.status as never) ? sp.status! : "";
  const kind = FEEDBACK_KINDS.includes(sp.kind as never) ? sp.kind! : "";
  const [items, counts] = await Promise.all([listFeedbackForAdmin({ status, kind }), countFeedbackByStatus()]);

  const href = (s: string, k: string) => `/admin/feedback${s || k ? `?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(k ? { kind: k } : {}) })}` : ""}`;
  const chip = (active: boolean) =>
    `font-sans text-[12px] px-3 py-1.5 border ${active ? "border-bk-gold-from text-bk-gold-light" : "border-bk-border text-bk-body hover:text-bk-heading"}`;

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>Feedback</SectionHeading>
        <p className="font-sans text-[13px] text-bk-body pl-[19px]">
          Feature ideas and problem reports from visitors and users. Set a status and, if you like, leave a note. A signed-in sender is
          notified when you mark it planned, done or won&apos;t do. Senders can ask to have their message removed: delete it here.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href={href("", kind)} className={chip(!status)}>All</Link>
        {FEEDBACK_STATUSES.map((s) => (
          <Link key={s} href={href(s, kind)} className={chip(status === s)}>{FEEDBACK_STATUS_LABEL[s]} ({counts[s] ?? 0})</Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={href(status, "")} className={chip(!kind)}>Any kind</Link>
        {FEEDBACK_KINDS.map((k) => (
          <Link key={k} href={href(status, k)} className={chip(kind === k)}>{FEEDBACK_KIND_LABEL[k]}</Link>
        ))}
      </div>

      <FeedbackManager
        items={items.map((f) => ({
          id: f.id, kind: f.kind, message: f.message, pageUrl: f.pageUrl, status: f.status, adminNote: f.adminNote,
          sender: f.sender, senderEmail: f.senderEmail, createdAt: f.createdAt.toISOString(),
        }))}
      />
      {items.length >= 100 && <p className="font-sans text-[12px] text-bk-muted">Showing the newest 100. Use the filters to narrow down.</p>}
    </div>
  );
}
