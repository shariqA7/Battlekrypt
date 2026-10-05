import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listNotifications } from "@/lib/services/notifications";
import MarkRead from "./MarkRead";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirectTo=/notifications");

  const items = await listNotifications(user.id);
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="font-sans font-extrabold text-2xl text-bk-heading mb-6">Notifications</h1>
      {hasUnread && <MarkRead />}
      {items.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">Nothing yet.</p>
      ) : (
        <ul className="border border-bk-border divide-y divide-bk-border">
          {items.map((n) => {
            const inner = (
              <div className="px-4 py-3">
                <p className={`font-sans text-[13px] ${n.readAt ? "text-bk-body" : "text-bk-heading font-medium"}`}>
                  {!n.readAt && <span className="inline-block w-1.5 h-1.5 rounded-full bg-bk-gold-light mr-2 align-middle" />}
                  {n.title}
                </p>
                {n.body && <p className="font-sans text-[12px] text-bk-muted mt-0.5">{n.body}</p>}
                <p className="font-sans text-[11px] text-bk-muted mt-1">{n.createdAt.toLocaleString()}</p>
              </div>
            );
            return <li key={n.id}>{n.href ? <Link href={n.href} className="block hover:bg-bk-surface">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </main>
  );
}
