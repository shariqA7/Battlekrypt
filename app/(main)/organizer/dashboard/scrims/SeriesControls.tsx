"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ShareLinks from "@/components/ui/ShareLinks";

// Pause, resume or end one series, and share its link.
export default function SeriesControls({ id, slug, name, status }: { id: string; slug: string; name: string; status: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: "pause" | "resume" | "end") {
    if (action === "end" && !confirm("End this series? No new sessions will be made, and upcoming sessions nobody joined are cancelled. Sessions that have players stay until you cancel them.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/organizer/scrim-series/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(body.error?.message ?? "Something went wrong.");
    if (action === "end") setMsg(`Ended. ${body.cancelledEmpty ?? 0} empty session(s) cancelled${body.withPlayers ? `; ${body.withPlayers} with players remain: cancel each from its page` : ""}.`);
    router.refresh();
  }

  const btn = "border border-bk-border text-bk-heading font-sans text-[12px] px-3 h-[34px] disabled:opacity-50";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2 items-center">
        {status === "active" && <button disabled={busy} className={btn} onClick={() => act("pause")}>Pause</button>}
        {status === "paused" && <button disabled={busy} className={btn} onClick={() => act("resume")}>Resume</button>}
        {status !== "ended" && <button disabled={busy} className={`${btn} text-bk-live`} onClick={() => act("end")}>End series</button>}
      </div>
      {status !== "ended" && <ShareLinks path={`/s/${slug}`} title={`${name}: join the next scrim`} className="mt-3" />}
      {msg && <p className="font-sans text-[12px] text-bk-body mt-2" role="status">{msg}</p>}
    </div>
  );
}
