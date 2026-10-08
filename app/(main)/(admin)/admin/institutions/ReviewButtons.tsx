"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
          <button
            disabled={busy}
            onClick={() => act("reject")}
            className="flex-1 sm:flex-none border border-bk-live text-bk-live font-bold text-[12px] px-4 h-[40px] disabled:opacity-50"
          >
            Remove verification
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => act("approve")}
            className="flex-1 sm:flex-none bg-bk-gold-light text-black font-bold text-[12px] px-4 h-[40px] disabled:opacity-50"
          >
            Verify institute
          </button>
        )}
      </div>
    </div>
  );
}
