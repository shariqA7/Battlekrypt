"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("Cancel this challenge?")) return;
    const res = await fetch(`/api/challenges/${id}/cancel`, { method: "POST" });
    if (!res.ok) return setError((await res.json()).error.message);
    router.refresh();
  }

  return (
    <span>
      <button onClick={cancel} className="font-sans text-[12px] text-bk-live underline">Cancel challenge</button>
      {error && <span className="ml-3 font-sans text-[12px] text-bk-live">{error}</span>}
    </span>
  );
}
