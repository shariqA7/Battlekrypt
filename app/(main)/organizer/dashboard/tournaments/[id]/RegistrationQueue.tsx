"use client";

import { useEffect, useState } from "react";
import type { ClubTeamCandidate, ClubSoloCandidate } from "@/lib/services/club-entries";

type ClubCandidate = ClubTeamCandidate | ClubSoloCandidate;

interface Registration {
  id: string;
  status: string;
  paymentStatus: string;
  paymentProofUrl: string | null;
  placement: number | null;
  points: number | null;
  player: { user: { displayName: string } } | null;
  teamEntry: { name: string; members: unknown[] } | null;
}

interface TournamentRuleOption {
  id: string;
  title: string | null;
  description: string;
}

function ResultInput({
  registrationId,
  initialPlacement,
  initialPoints,
}: {
  registrationId: string;
  initialPlacement: number | null;
  initialPoints: number | null;
}) {
  const [placement, setPlacement] = useState(initialPlacement ?? "");
  const [points, setPoints] = useState(initialPoints ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/registrations/${registrationId}/result`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placement: placement === "" ? undefined : Number(placement),
        points: points === "" ? undefined : Number(points),
      }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        placeholder="Rank"
        value={placement}
        onChange={(e) => setPlacement(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-14 bg-bk-bg border border-bk-border text-bk-heading text-[11px] font-sans px-1.5 h-[26px]"
      />
      <input
        type="number"
        placeholder="Pts"
        value={points}
        onChange={(e) => setPoints(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-14 bg-bk-bg border border-bk-border text-bk-heading text-[11px] font-sans px-1.5 h-[26px]"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="border border-bk-border text-bk-body font-sans text-[10px] uppercase px-2 h-[26px] disabled:opacity-50"
      >
        {saved ? "✓" : "Save"}
      </button>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[rgba(239,159,39,0.15)] text-[#EF9F27]",
  approved: "bg-[rgba(29,158,117,0.15)] text-[#1D9E75]",
  rejected: "bg-[rgba(239,68,68,0.15)] text-bk-live",
  disqualified: "bg-[rgba(239,68,68,0.15)] text-bk-live",
};

export default function RegistrationQueue({
  tournamentId,
  initialRegistrations,
  mode,
  rules,
}: {
  tournamentId: string;
  initialRegistrations: Registration[];
  mode: string;
  rules: TournamentRuleOption[];
}) {
  const [registrations, setRegistrations] = useState(initialRegistrations);
  // Which registration's disqualify panel is open, if any — replaces a
  // window.prompt so the organizer can cite one of the tournament's own
  // rules instead of just typing free text.
  const [disqualifyingId, setDisqualifyingId] = useState<string | null>(null);
  const [dqRuleId, setDqRuleId] = useState("");
  const [dqReason, setDqReason] = useState("");
  const [dqError, setDqError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Club override — bypasses the roster-lock rule, works at any tournament
  // status (spec §4's "organizer is the override valve").
  const [showClubAdd, setShowClubAdd] = useState(false);
  const [clubQuery, setClubQuery] = useState("");
  const [clubResults, setClubResults] = useState<ClubCandidate[]>([]);
  // For a team result: which of its roster members to actually enter.
  const [teamSelection, setTeamSelection] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!showClubAdd) return;
    const q = clubQuery.trim();
    if (q.length < 2) return;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/tournaments/${tournamentId}/club-entries/search?q=${encodeURIComponent(q)}`
        );
        const json = await res.json();
        setClubResults(json.data ?? []);
        setTeamSelection((prev) => {
          const next = { ...prev };
          for (const c of json.data ?? []) {
            if (c.kind === "team" && !(c.teamId in next)) {
              next[c.teamId] = c.members.map((m: { id: string }) => m.id);
            }
          }
          return next;
        });
      } catch {
        setClubResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [clubQuery, showClubAdd, tournamentId]);

  // Derived rather than cleared in the effect: short queries show nothing.
  const shownClubResults = clubQuery.trim().length >= 2 ? clubResults : [];

  function toggleMember(teamId: string, playerId: string) {
    setTeamSelection((prev) => {
      const current = prev[teamId] ?? [];
      const next = current.includes(playerId)
        ? current.filter((id) => id !== playerId)
        : [...current, playerId];
      return { ...prev, [teamId]: next };
    });
  }

  async function submitManualAdd(body: Record<string, unknown>) {
    setManualSubmitting(true);
    setManualError(null);

    const res = await fetch(`/api/tournaments/${tournamentId}/registrations/manual-add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentStatus: "waived", ...body }),
    });

    if (!res.ok) {
      const { error } = await res.json();
      setManualError(error.message);
      setManualSubmitting(false);
      return;
    }

    setManualSubmitting(false);
    // A full reload, not router.refresh() — this component's `registrations`
    // state is a local useState seeded from initialRegistrations, which only
    // reads that prop on first mount. router.refresh() alone re-renders the
    // parent Server Component with fresh data but wouldn't actually update
    // this already-mounted component's local state.
    window.location.reload();
  }

  function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    void submitManualAdd({ playerEmail: manualEmail });
  }

  function addClubTeam(teamId: string) {
    const memberPlayerIds = teamSelection[teamId] ?? [];
    if (memberPlayerIds.length === 0) return;
    void submitManualAdd({ clubTeamId: teamId, memberPlayerIds });
  }

  function addClubSolo(playerId: string) {
    void submitManualAdd({ clubPlayerId: playerId });
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    const res = await fetch(`/api/registrations/${id}/${action}`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setRegistrations((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: updated.status } : r))
      );
    }
  }

  function openDisqualify(id: string) {
    setDisqualifyingId(id);
    setDqRuleId("");
    setDqReason("");
    setDqError(null);
  }

  async function submitDisqualify() {
    if (!disqualifyingId || !dqReason.trim()) return;
    setDqError(null);
    const res = await fetch(`/api/registrations/${disqualifyingId}/disqualify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: dqReason.trim(), ruleId: dqRuleId || undefined }),
    });
    if (!res.ok) {
      setDqError((await res.json()).error.message);
      return;
    }
    const updated = await res.json();
    setRegistrations((prev) =>
      prev.map((r) => (r.id === disqualifyingId ? { ...r, status: updated.status } : r))
    );
    setDisqualifyingId(null);
  }

  const manualAddForm = (
    <div className="mb-4">
      <form onSubmit={handleManualAdd} className="flex gap-2">
        <input
          type="email"
          required
          value={manualEmail}
          onChange={(e) => setManualEmail(e.target.value)}
          placeholder="Player's email — manually add them"
          className="flex-1 bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[34px]"
        />
        <button
          type="submit"
          disabled={manualSubmitting}
          className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-3 disabled:opacity-50"
        >
          {manualSubmitting ? "Adding..." : "Add player"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setShowClubAdd((v) => !v)}
        className="font-sans text-bk-muted text-[11px] underline mt-1.5"
      >
        {showClubAdd ? "Hide" : "Add a club team or player instead"}
      </button>

      {showClubAdd && (
        <div className="bg-bk-surface border border-bk-border p-3 mt-2 flex flex-col gap-2">
          <p className="font-sans text-bk-muted text-[11px]">
            Bypasses registration status/limits — the organizer override valve.
          </p>
          <input
            value={clubQuery}
            onChange={(e) => setClubQuery(e.target.value)}
            placeholder={mode === "solo" ? "Search club or player name" : "Search club or team name"}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[34px]"
          />
          {shownClubResults.map((c) =>
            c.kind === "solo" ? (
              <div
                key={c.playerId}
                className="flex items-center justify-between bg-bk-bg border border-bk-border px-3 py-2"
              >
                <span className="font-sans text-[12px] text-bk-body">
                  {c.playerName} <span className="text-bk-muted">· {c.clubName}</span>
                </span>
                <button
                  type="button"
                  disabled={manualSubmitting}
                  onClick={() => addClubSolo(c.playerId)}
                  className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            ) : (
              <div key={c.teamId} className="bg-bk-bg border border-bk-border px-3 py-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-sans text-[12px] text-bk-body">
                    {c.teamName} <span className="text-bk-muted">· {c.clubName}</span>
                  </span>
                  <button
                    type="button"
                    disabled={manualSubmitting || (teamSelection[c.teamId] ?? []).length === 0}
                    onClick={() => addClubTeam(c.teamId)}
                    className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {c.members.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-1 font-sans text-[11px] text-bk-muted"
                    >
                      <input
                        type="checkbox"
                        checked={(teamSelection[c.teamId] ?? []).includes(m.id)}
                        onChange={() => toggleMember(c.teamId, m.id)}
                      />
                      {m.name}
                      {m.role === "substitute" && " (sub)"}
                    </label>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );

  if (registrations.length === 0) {
    return (
      <div>
        {manualAddForm}
        {manualError && <p className="text-bk-live text-[11px] font-sans mb-3">{manualError}</p>}
        <p className="text-bk-muted font-sans text-sm">No registrations yet.</p>
      </div>
    );
  }

  return (
    <div>
      {manualAddForm}
      {manualError && <p className="text-bk-live text-[11px] font-sans mb-3">{manualError}</p>}
      <div className="flex flex-col gap-2">
        {registrations.map((r) => {
        const name = r.teamEntry?.name ?? r.player?.user.displayName ?? "Unknown";
        return (
          <div
            key={r.id}
            className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
          >
            <div>
              <p className="font-sans text-bk-heading text-sm">{name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`font-sans text-[10px] uppercase tracking-[0.5px] px-1.5 py-0.5 ${STATUS_BADGE[r.status]}`}>
                  {r.status}
                </span>
                {r.paymentProofUrl && (
                  <a
                    href={r.paymentProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bk-gold-light text-[11px] font-sans underline"
                  >
                    View payment proof
                  </a>
                )}
              </div>
            </div>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction(r.id, "approve")}
                  className="bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(r.id, "reject")}
                  className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Reject
                </button>
              </div>
            )}
            {r.status === "approved" && (
              <div className="flex items-center gap-3">
                <ResultInput
                  registrationId={r.id}
                  initialPlacement={r.placement}
                  initialPoints={r.points}
                />
                <button
                  onClick={() => openDisqualify(r.id)}
                  className="border border-bk-live text-bk-live font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5"
                >
                  Disqualify
                </button>
              </div>
            )}
          </div>
        );
      })}

      {disqualifyingId && (
        <div className="bg-bk-surface border border-bk-live p-3 mt-2 flex flex-col gap-2">
          <p className="font-sans text-bk-heading text-[13px]">Disqualify this registration</p>
          {rules.length > 0 && (
            <select
              value={dqRuleId}
              onChange={(e) => setDqRuleId(e.target.value)}
              className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 h-[34px]"
            >
              <option value="">No specific rule cited</option>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title ?? r.description}
                </option>
              ))}
            </select>
          )}
          <textarea
            value={dqReason}
            onChange={(e) => setDqReason(e.target.value)}
            placeholder="Reason for disqualification"
            rows={2}
            className="w-full bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-3 py-2"
          />
          {dqError && <p className="text-bk-live text-[12px] font-sans">{dqError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!dqReason.trim()}
              onClick={() => void submitDisqualify()}
              className="bg-bk-live text-white font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50"
            >
              Confirm disqualification
            </button>
            <button
              type="button"
              onClick={() => setDisqualifyingId(null)}
              className="border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
