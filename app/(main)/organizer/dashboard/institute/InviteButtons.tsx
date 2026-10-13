"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function InviteButtons({
  id,
  kind = "tournament",
}: {
  id: string;
  kind?: "tournament" | "challenge";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch(kind === "challenge"
        ? `/api/organizer/challenge-invites/${id}/respond`
        : `/api/organizer/cohost-invites/${id}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept }),
    });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      {error && <p className="text-bk-live text-[12px] mb-2">{error}</p>}
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => respond(true)}>
          Accept
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => respond(false)}>
          Decline
        </Button>
      </div>
    </div>
  );
}
