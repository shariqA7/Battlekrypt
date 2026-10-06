"use client";

import { useEffect, useState } from "react";

interface State {
  status: "pending" | "checked_in" | "no_show";
  opensAt: string | null;
  closesAt: string | null;
  locked: boolean;
}

// Shown on LAN tournaments, only to a signed-in player with an approved entry.
// Everyone else (signed out, not registered, online events) sees nothing.
export default function CheckInPanel({ tournamentId }: { tournamentId: string }) {
  const [state, setState] = useState<(State & { loadedAt: number }) | null>(null);
  const [reload, setReload] = useState(0);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tournaments/${tournamentId}/check-in`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setState(data ? { ...data, loadedAt: Date.now() } : null);
      })
      .catch(() => {
        if (!cancelled) setState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, reload]);

  if (!state) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error.message);
      setReload((n) => n + 1);
      return;
    }
    setCode("");
    setReload((n) => n + 1);
  }

  const now = state.loadedAt;
  const notOpen = state.opensAt && now < new Date(state.opensAt).getTime();
  const closed = state.closesAt && now > new Date(state.closesAt).getTime();

  return (
    <div className="mb-6 border border-bk-border bg-bk-surface p-4">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Check-in</p>
      {state.status === "checked_in" ? (
        <p className="font-sans text-[13px] text-bk-live font-bold">You&apos;re checked in.</p>
      ) : state.status === "no_show" ? (
        <p className="font-sans text-[13px] text-bk-live">
          You were marked as a no-show. Talk to the organizer at the venue.
        </p>
      ) : (
        <>
          <p className="font-sans text-[12px] text-bk-muted mb-3 break-words">
            Enter the code shown at the venue desk.
            {state.opensAt && ` Opens ${new Date(state.opensAt).toLocaleString()}.`}
            {state.closesAt && ` Closes ${new Date(state.closesAt).toLocaleString()}.`}
          </p>
          {notOpen ? (
            <p className="font-sans text-[12px] text-bk-gold-light">Check-in hasn&apos;t opened yet.</p>
          ) : closed || state.locked ? (
            <p className="font-sans text-[12px] text-bk-gold-light">
              {state.locked ? "Too many wrong codes." : "Check-in has closed."} Ask the organizer to check you in.
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={12}
                className="flex-1 bg-bk-bg border border-bk-border text-bk-heading font-mono text-[16px] tracking-[2px] px-3 h-[44px]"
              />
              <button
                type="submit"
                disabled={busy || !code.trim()}
                className="bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase px-5 h-[44px] disabled:opacity-50"
              >
                {busy ? "Checking..." : "Check in"}
              </button>
            </form>
          )}
          {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
        </>
      )}
    </div>
  );
}
