"use client";

// Club owner's roster screen: create teams, invite players (to a team as
// player/substitute, or as a solo player), and manage who's on the roster.
// All rules are enforced by the API; this just surfaces its error messages.
import { useCallback, useEffect, useState } from "react";

interface Game {
  id: string;
  name: string;
}
interface PlayerRef {
  id: string;
  name: string;
  avatarUrl: string | null;
}
interface Team {
  id: string;
  name: string;
  coachName: string | null;
  game: Game;
  members: { rosterId: string; role: "player" | "substitute"; player: PlayerRef }[];
}
interface SoloPlayer {
  rosterId: string;
  game: Game;
  player: PlayerRef;
}
interface Roster {
  teams: Team[];
  soloPlayers: SoloPlayer[];
}
interface PendingInvite {
  id: string;
  role: "player" | "substitute";
  game: Game;
  team: { id: string; name: string } | null;
  player: PlayerRef;
}
interface SearchResult extends PlayerRef {
  onYourRoster: boolean;
}

export interface RosterLimits {
  isPaid: boolean;
  canSetCoach: boolean;
  canUseSubstitutes: boolean;
}

const inputClass =
  "w-full bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[36px]";
const labelClass =
  "block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5";
const primaryBtn =
  "bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50";
const ghostBtn =
  "border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1 whitespace-nowrap";

async function api(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong.");
  return json;
}

export default function RosterManager({
  games,
  limits,
  initialRoster,
  initialInvites,
}: {
  games: Game[];
  limits: RosterLimits;
  initialRoster: Roster;
  initialInvites: PendingInvite[];
}) {
  const [roster, setRoster] = useState(initialRoster);
  const [invites, setInvites] = useState(initialInvites);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [r, i] = await Promise.all([api("/api/club/roster"), api("/api/club/invites")]);
    setRoster(r);
    setInvites(i.data);
  }, []);

  // Runs an action, then reloads; shows the API's message if it fails.
  async function run(fn: () => Promise<unknown>, success?: string) {
    setError(null);
    setNotice(null);
    try {
      await fn();
      await refresh();
      if (success) setNotice(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  // ---- create team
  const [teamGameId, setTeamGameId] = useState(games[0]?.id ?? "");
  const [teamName, setTeamName] = useState("");
  const [teamCoach, setTeamCoach] = useState("");

  // ---- invite
  const [inviteGameId, setInviteGameId] = useState(games[0]?.id ?? "");
  const [inviteTeamId, setInviteTeamId] = useState(""); // "" = solo
  const [inviteRole, setInviteRole] = useState<"player" | "substitute">("player");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  const teamsForInviteGame = roster.teams.filter((t) => t.game.id === inviteGameId);

  // Derived (not synced with effects): a team choice that no longer matches
  // the selected game falls back to "solo", and substitutes only make sense
  // on a team.
  const teamId = teamsForInviteGame.some((t) => t.id === inviteTeamId) ? inviteTeamId : "";
  const role: "player" | "substitute" = teamId ? inviteRole : "player";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const handle = setTimeout(async () => {
      try {
        const json = await api(`/api/club/players/search?q=${encodeURIComponent(q)}`);
        setResults(json.data);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const shownResults = query.trim().length >= 3 ? results : [];

  function inviteTargetLabel() {
    const team = roster.teams.find((t) => t.id === teamId);
    return team ? `${team.name} (${role})` : "solo player";
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="bg-bk-surface border border-bk-border p-3">
        <p className="font-sans text-[13px] text-bk-body">
          {limits.isPaid
            ? "Paid plan: unlimited teams and solo players per game, with substitutes and a coach."
            : "Free plan: one team or one solo player per game. Substitutes and coaches need a paid plan."}
        </p>
      </div>

      {error && <p className="text-bk-live text-[13px] font-sans -mt-6">{error}</p>}
      {notice && <p className="text-bk-gold-light text-[13px] font-sans -mt-6">{notice}</p>}

      {/* ---------------- Teams ---------------- */}
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">Teams</p>

        <div className="bg-bk-surface border border-bk-border p-3 mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Game</label>
            <select
              value={teamGameId}
              onChange={(e) => setTeamGameId(e.target.value)}
              className={inputClass}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Team name</label>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={40}
              className={inputClass}
              placeholder="Alpha"
            />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>
              Coach (optional{limits.canSetCoach ? "" : " — paid plans only"})
            </label>
            <input
              value={teamCoach}
              onChange={(e) => setTeamCoach(e.target.value)}
              disabled={!limits.canSetCoach}
              maxLength={60}
              className={`${inputClass} disabled:opacity-50`}
              placeholder="Coach name"
            />
          </div>
          <div className="col-span-2">
            <button
              type="button"
              className={primaryBtn}
              disabled={!teamGameId || teamName.trim().length < 2}
              onClick={() =>
                run(async () => {
                  await api("/api/club/teams", "POST", {
                    gameId: teamGameId,
                    name: teamName,
                    coachName: teamCoach || undefined,
                  });
                  setTeamName("");
                  setTeamCoach("");
                }, "Team created.")
              }
            >
              Create team
            </button>
          </div>
        </div>

        {roster.teams.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">No teams yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roster.teams.map((t) => (
              <div key={t.id} className="bg-bk-surface border border-bk-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-sans text-bk-heading text-sm">
                      {t.name}{" "}
                      <span className="text-bk-muted text-xs">· {t.game.name}</span>
                    </p>
                    <p className="font-sans text-bk-muted text-xs mt-0.5">
                      Coach: {t.coachName ?? "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {(limits.canSetCoach || t.coachName) && (
                      <button
                        type="button"
                        className={ghostBtn}
                        onClick={() => {
                          const next = window.prompt(
                            "Coach name (leave empty to remove):",
                            t.coachName ?? ""
                          );
                          if (next === null) return;
                          run(() => api(`/api/club/teams/${t.id}`, "PATCH", { coachName: next }));
                        }}
                      >
                        {t.coachName ? "Edit coach" : "Set coach"}
                      </button>
                    )}
                    {t.members.length === 0 && (
                      <button
                        type="button"
                        className={ghostBtn}
                        onClick={() => {
                          if (window.confirm(`Delete team "${t.name}"?`)) {
                            run(() => api(`/api/club/teams/${t.id}`, "DELETE"));
                          }
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {t.members.length === 0 ? (
                  <p className="font-sans text-bk-muted text-xs mt-2">No members yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {t.members.map((m) => (
                      <div key={m.rosterId} className="flex items-center justify-between">
                        <span className="font-sans text-bk-body text-[13px]">
                          {m.player.name}
                          {m.role === "substitute" && (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.5px] text-bk-gold-light">
                              Sub
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          className={ghostBtn}
                          onClick={() => {
                            if (window.confirm(`Remove ${m.player.name} from ${t.name}?`)) {
                              run(() => api(`/api/club/roster/${m.rosterId}`, "DELETE"));
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Solo players ---------------- */}
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">Solo players</p>
        {roster.soloPlayers.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">No solo players yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {roster.soloPlayers.map((s) => (
              <div
                key={s.rosterId}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
              >
                <span className="font-sans text-bk-heading text-sm">
                  {s.player.name}{" "}
                  <span className="text-bk-muted text-xs">· {s.game.name}</span>
                </span>
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => {
                    if (window.confirm(`Remove ${s.player.name} from ${s.game.name}?`)) {
                      run(() => api(`/api/club/roster/${s.rosterId}`, "DELETE"));
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Invite ---------------- */}
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-1">Invite a player</p>
        <p className="font-sans text-bk-muted text-xs mb-3">
          The player joins your roster once they accept. To move someone to another game or
          team, remove them first and invite them again.
        </p>

        <div className="bg-bk-surface border border-bk-border p-3 grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Game</label>
            <select
              value={inviteGameId}
              onChange={(e) => setInviteGameId(e.target.value)}
              className={inputClass}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Join as</label>
            <select
              value={teamId}
              onChange={(e) => setInviteTeamId(e.target.value)}
              className={inputClass}
            >
              <option value="">Solo player</option>
              {teamsForInviteGame.map((t) => (
                <option key={t.id} value={t.id}>
                  Team: {t.name}
                </option>
              ))}
            </select>
          </div>
          {teamId && (
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={role}
                onChange={(e) => setInviteRole(e.target.value as "player" | "substitute")}
                className={inputClass}
              >
                <option value="player">Player</option>
                <option value="substitute" disabled={!limits.canUseSubstitutes}>
                  Substitute{limits.canUseSubstitutes ? "" : " (paid plans)"}
                </option>
              </select>
            </div>
          )}
          <div className="col-span-2">
            <label className={labelClass}>Find player by name</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={inputClass}
              placeholder="At least 3 letters"
            />
          </div>

          {shownResults.length > 0 && (
            <div className="col-span-2 flex flex-col gap-1.5">
              {shownResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between">
                  <span className="font-sans text-bk-body text-[13px]">{p.name}</span>
                  {p.onYourRoster ? (
                    <span className="font-sans text-bk-muted text-xs">On your roster</span>
                  ) : (
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={!inviteGameId}
                      onClick={() =>
                        run(async () => {
                          await api("/api/club/invites", "POST", {
                            playerId: p.id,
                            gameId: inviteGameId,
                            teamId: teamId || undefined,
                            role,
                          });
                          setQuery("");
                          setResults([]);
                        }, `Invitation sent to ${p.name} as ${inviteTargetLabel()}.`)
                      }
                    >
                      Invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Pending invites ---------------- */}
      <section>
        <p className="font-sans font-medium text-bk-heading text-sm mb-3">
          Pending invitations ({invites.length})
        </p>
        {invites.length === 0 ? (
          <p className="text-bk-muted font-sans text-sm">Nothing pending.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {invites.map((i) => (
              <div
                key={i.id}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-sans text-bk-heading text-sm">{i.player.name}</p>
                  <p className="font-sans text-bk-muted text-xs mt-0.5">
                    {i.game.name} ·{" "}
                    {i.team ? `${i.team.name} (${i.role})` : "solo player"}
                  </p>
                </div>
                <button
                  type="button"
                  className={ghostBtn}
                  onClick={() => run(() => api(`/api/club/invites/${i.id}`, "DELETE"))}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
