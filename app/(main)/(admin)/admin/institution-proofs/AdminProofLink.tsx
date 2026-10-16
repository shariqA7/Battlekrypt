"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

// Asking the server first means the look is written to the audit log; only then
// is the photo opened (5-minute link, signed with the admin's own login).
export default function AdminProofLink({ registrationId }: { registrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/institution-proofs/${registrationId}/view`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Couldn't open the ID photo.");
      setBusy(false);
      return;
    }
    const { path } = await res.json();
    const { data } = await createClient().storage.from("institution-proofs").createSignedUrl(path, 300);
    setBusy(false);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    else setError("The photo couldn't be opened. Check the admin storage policy in SETUP.md.");
  }

  return (
    <div>
      <Button variant="outline" size="sm" disabled={busy} onClick={open}>
        {busy ? "Opening..." : "View student ID"}
      </Button>
      {error && <p className="text-bk-live text-[12px] mt-2">{error}</p>}
    </div>
  );
}
