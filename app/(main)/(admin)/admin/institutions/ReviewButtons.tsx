"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function ReviewButtons({ id, verified }: { id: string; verified: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/institutions/${id}/${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      setError(error.message);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      {verified && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason (required to remove verification)"
          className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] px-3 h-[38px]"
        />
      )}
      {error && <p className="text-bk-live text-[12px] mt-2">{error}</p>}
      <div className="flex gap-2 mt-2">
        {verified ? (
          <Button variant="danger" className="flex-1 sm:flex-none" disabled={busy} onClick={() => act("reject")}>
            Remove verification
          </Button>
        ) : (
          <Button className="flex-1 sm:flex-none" disabled={busy} onClick={() => act("approve")}>
            Verify institute
          </Button>
        )}
      </div>
    </div>
  );
}
