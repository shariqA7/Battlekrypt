"use client";

// Shown alongside the normal JoinForm when the signed-in user owns or
// captains a club team (or a solo club roster spot) that fits this
// tournament's game/mode. Lets them register — or, before the tournament
// locks, adjust who from the roster is playing.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  name: string;
  role: "player" | "substitute";
}
interface TeamOption {
  id: string;
  name: string;
  members: Member[];
  entry: { id: string; memberPlayerIds: string[] } | null;
}
interface Options {
  editable: boolean;
  teams: TeamOption[];
  soloEntry: { playerId: string; alreadyRegistered: boolean } | null;
}

const primaryBtn =
  "bg-white text-bk-bg font-sans font-bold text-[12px] tracking-[0.8px] uppercase py-2 px-4 disabled:opacity-50";

export default function ClubEntryPanel({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<Options | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Draft member selection per team, keyed by team id.
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/club-entries/options`)
      .then((r) => r.json())
      .then((json) => {
        setOptions(json.data);
        const initial: Record<string, string[]> = {};
        (json.data?.teams ?? []).forEach((t: TeamOption) => {
          initial[t.id] = t.entry?.memberPlayerIds ?? t.members.map((m) => m.id);
        });
        setSelection(initial);
      })
      .catch(() => setOptions(null));
  }, [tournamentId]);

  function toggle(teamId: string, playerId: string) {
    setSelection((prev) => {
      const current = prev[teamId] ?? [];
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      return { ...prev, [teamId]: next };
    });
  }

  async function submitTeam(team: TeamOption) {
    setBusy(true);
    setError(null);
    const memberPlayerIds = selection[team.id] ?? [];
    const url = team.entry
      ? `/api/tournaments/${tournamentId}/club-entries/${team.entry.id}`
      : `/api/tournaments/${tournamentId}/club-entries`;
    const res = await fetch(url, {
      method: team.entry ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        team.entry ? { memberPlayerIds } : { teamId: team.id, memberPlayerIds }
      ),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error?.message ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  async function submitSolo(playerId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/club-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error?.message ?? "Something went wrong.");
    }
    setBusy(false);
    router.refresh();
  }

  if (!options) return null;

  return (
    <div className="bg-bk-surface border border-bk-border p-4 mb-6">
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">
        Register your club
      </p>
      {!options.editable && (
        <p className="font-sans text-bk-muted text-xs mb-3">
          Registration is no longer open — your organizer can still add or
          change your entry.
        </p>
      )}
      {error && <p className="text-bk-live text-[12px] font-sans mb-2">{error}</p>}

      {options.soloEntry && (
        <button
          type="button"
          disabled={busy || options.soloEntry.alreadyRegistered || !options.editable}
          onClick={() => submitSolo(options.soloEntry!.playerId)}
          className={primaryBtn}
        >
          {options.soloEntry.alreadyRegistered ? "Already registered" : "Register this player"}
        </button>
      )}

      {options.teams.map((t) => (
        <div key={t.id} className="border-t border-bk-border pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
          <p className="font-sans text-bk-heading text-sm mb-2">{t.name}</p>
          <div className="flex flex-col gap-1.5 mb-3">
            {t.members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 font-sans text-[13px] text-bk-body">
                <input
                  type="checkbox"
                  checked={(selection[t.id] ?? []).includes(m.id)}
                  onChange={() => toggle(t.id, m.id)}
                  disabled={!options.editable}
                />
                {m.name}
                {m.role === "substitute" && (
                  <span className="text-[10px] uppercase tracking-[0.5px] text-bk-gold-light">
                    Sub
                  </span>
                )}
              </label>
            ))}
          </div>
          <button
            type="button"
            disabled={busy || !options.editable || (selection[t.id] ?? []).length === 0}
            onClick={() => submitTeam(t)}
            className={primaryBtn}
          >
            {t.entry ? "Update lineup" : "Enter this team"}
          </button>
        </div>
      ))}
    </div>
  );
}
