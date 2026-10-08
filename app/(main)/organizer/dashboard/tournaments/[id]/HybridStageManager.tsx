"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toLocalInput } from "@/components/tournaments/VenuePicker";

type CheckIn = "pending" | "checked_in" | "no_show";

interface Stage {
  id: string;
  name: string;
  venueType: "online" | "lan" | "hybrid";
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  checkInOpensAt: Date | string | null;
  checkInClosesAt: Date | string | null;
  checkInCode: string | null;
  restricted: boolean;
  roomId: string | null;
}
interface Entrant {
  id: string; // registration id
  name: string;
  status: string;
  points: number | null;
}
interface StageEntryRow {
  id: string;
  stageId: string;
  registrationId: string;
  checkInStatus: CheckIn;
}

const input =
  "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2.5 h-[38px] w-full";
const lbl = "block font-sans text-[10px] uppercase tracking-[0.8px] text-bk-muted mb-1 mt-3";

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return { ok: true as const, data: await res.json() };
  const j = await res.json().catch(() => ({}));
  return { ok: false as const, message: (j.error?.message as string) ?? "Something went wrong." };
}

function StageCard({
  tournamentId,
  stage,
  entrants,
  entries,
}: {
  tournamentId: string;
  stage: Stage;
  entrants: Entrant[];
  entries: StageEntryRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topN, setTopN] = useState("4");
  const [v, setV] = useState({
    venueType: stage.venueType === "lan" ? "lan" : "online",
    venueName: stage.venueName ?? "",
    venueAddress: stage.venueAddress ?? "",
    venueCity: stage.venueCity ?? "",
    opens: toLocalInput(stage.checkInOpensAt),
    closes: toLocalInput(stage.checkInClosesAt),
    restricted: stage.restricted,
  });
  const [room, setRoom] = useState({ id: "", pw: "", at: "" });
  const [roomOpen, setRoomOpen] = useState(false);

  const isLan = stage.venueType === "lan";
  const byReg = new Map(entries.map((e) => [e.registrationId, e]));
  const advancedCount = entries.length;
  const counts = {
    checkedIn: entries.filter((e) => e.checkInStatus === "checked_in").length,
    noShow: entries.filter((e) => e.checkInStatus === "no_show").length,
  };

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setMsg(r.message ?? "Something went wrong.");
    else router.refresh();
  }

  const saveVenue = () =>
    run(() =>
      api(`/api/stages/${stage.id}/venue`, "PATCH", {
        venueType: v.venueType,
        ...(v.venueType === "lan"
          ? {
              venueName: v.venueName,
              venueAddress: v.venueAddress,
              venueCity: v.venueCity,
              checkInOpensAt: v.opens ? new Date(v.opens).toISOString() : null,
              checkInClosesAt: v.closes ? new Date(v.closes).toISOString() : null,
            }
          : { restricted: v.restricted }),
      })
    );

  const toggle = (e: Entrant) =>
    run(() =>
      byReg.has(e.id)
        ? api(`/api/stages/${stage.id}/advance`, "DELETE", { registrationId: e.id })
        : api(`/api/stages/${stage.id}/advance`, "POST", { registrationIds: [e.id] })
    );

  const advanceTop = () => run(() => api(`/api/stages/${stage.id}/advance`, "POST", { top: Number(topN) }));
  const setCheck = (entryId: string, status: CheckIn) =>
    run(() => api(`/api/stage-entries/${entryId}/check-in`, "POST", { status }));

  const saveRoom = () =>
    run(async () => {
      const r = await api(`/api/stages/${stage.id}`, "PATCH", {
        roomId: room.id,
        roomPassword: room.pw,
        roomRevealAt: room.at ? new Date(room.at).toISOString() : undefined,
      });
      if (r.ok) setRoomOpen(false);
      return r;
    });

  return (
    <div className="bg-bk-surface border border-bk-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-sans text-bk-heading text-sm font-bold break-words">{stage.name}</p>
        <span className="font-sans text-[10px] uppercase tracking-[0.5px] text-bk-gold-light">
          {isLan ? `LAN${stage.venueCity ? ` · ${stage.venueCity}` : ""}` : "Online"}
          {stage.restricted ? " · advancing entries only" : ""}
        </span>
      </div>

      {/* venue */}
      <label className={lbl}>Where is this stage played</label>
      <div className="flex gap-2">
        {(["online", "lan"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setV({ ...v, venueType: t })}
            className={`flex-1 h-[38px] text-[12px] font-sans uppercase tracking-[0.5px] ${
              v.venueType === t ? "bg-bk-gold-light text-bk-bg" : "bg-bk-bg text-bk-body border border-bk-border"
            }`}
          >
            {t === "lan" ? "LAN" : "Online"}
          </button>
        ))}
      </div>

      {v.venueType === "lan" ? (
        <>
          <label className={lbl}>Venue name *</label>
          <input className={input} value={v.venueName} onChange={(e) => setV({ ...v, venueName: e.target.value })} />
          <label className={lbl}>Address *</label>
          <input className={input} value={v.venueAddress} onChange={(e) => setV({ ...v, venueAddress: e.target.value })} />
          <label className={lbl}>City *</label>
          <input className={input} value={v.venueCity} onChange={(e) => setV({ ...v, venueCity: e.target.value })} />
          <label className={lbl}>Check-in opens</label>
          <input type="datetime-local" className={input} value={v.opens} onChange={(e) => setV({ ...v, opens: e.target.value })} />
          <label className={lbl}>Check-in closes</label>
          <input type="datetime-local" className={input} value={v.closes} onChange={(e) => setV({ ...v, closes: e.target.value })} />
        </>
      ) : (
        <label className="flex items-start gap-2 mt-3 font-sans text-[12px] text-bk-body">
          <input
            type="checkbox"
            checked={v.restricted}
            onChange={(e) => setV({ ...v, restricted: e.target.checked })}
            className="mt-0.5"
          />
          <span>Only entries I advance to this stage can see its room</span>
        </label>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={saveVenue}
        className="mt-3 w-full sm:w-auto bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-4 h-[40px] disabled:opacity-50"
      >
        Save venue
      </button>

      {/* online room */}
      {!isLan && (
        <div className="mt-3">
          {stage.roomId && !roomOpen ? (
            <p className="font-mono text-[11px] text-bk-gold-light">Room {stage.roomId} set</p>
          ) : (
            <button type="button" onClick={() => setRoomOpen(true)} className="text-[11px] font-sans text-bk-gold-light underline">
              {roomOpen ? "" : "Set room"}
            </button>
          )}
          {roomOpen && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              <input className={input} placeholder="Room ID" value={room.id} onChange={(e) => setRoom({ ...room, id: e.target.value })} />
              <input className={input} placeholder="Password" value={room.pw} onChange={(e) => setRoom({ ...room, pw: e.target.value })} />
              <input type="datetime-local" className={input} value={room.at} onChange={(e) => setRoom({ ...room, at: e.target.value })} />
              <button
                type="button"
                disabled={busy}
                onClick={saveRoom}
                className="sm:col-span-3 bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] uppercase py-2.5 disabled:opacity-50"
              >
                Save room details
              </button>
            </div>
          )}
        </div>
      )}

      {/* LAN code */}
      {isLan && stage.checkInCode && (
        <div className="mt-4 border border-bk-border bg-bk-bg p-3">
          <p className="font-sans text-[10px] uppercase tracking-[0.8px] text-bk-muted">
            Check-in code (show it at the venue desk, not online)
          </p>
          <p className="font-mono text-bk-gold-light text-2xl tracking-[4px] my-1">{stage.checkInCode}</p>
          <p className="font-sans text-[12px] text-bk-body">
            {counts.checkedIn} checked in · {counts.noShow} no-show · {advancedCount - counts.checkedIn - counts.noShow} waiting
          </p>
        </div>
      )}

      {/* advancement */}
      <p className="font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mt-5 mb-2">
        Advancing to this stage ({advancedCount})
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="font-sans text-[12px] text-bk-body">Advance the top</span>
        <input
          inputMode="numeric"
          value={topN}
          onChange={(e) => setTopN(e.target.value.replace(/\D/g, ""))}
          className="bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-mono px-2 h-[36px] w-16 text-center"
        />
        <span className="font-sans text-[12px] text-bk-body">by points</span>
        <button
          type="button"
          disabled={busy || !topN}
          onClick={advanceTop}
          className="border border-bk-border text-bk-body font-sans text-[11px] uppercase px-3 h-[36px] disabled:opacity-50"
        >
          Advance
        </button>
      </div>

      {entrants.length === 0 && <p className="font-sans text-[12px] text-bk-muted">No approved entries yet.</p>}
      <div className="flex flex-col gap-1.5">
        {entrants.map((e) => {
          const entry = byReg.get(e.id);
          return (
            <div key={e.id} className="flex flex-wrap items-center gap-2 bg-bk-bg border border-bk-border px-2.5 py-2">
              <label className="flex items-center gap-2 flex-1 min-w-[140px] font-sans text-[13px] text-bk-heading break-words">
                <input type="checkbox" checked={!!entry} disabled={busy} onChange={() => toggle(e)} />
                <span>
                  {e.name}
                  {e.points !== null && <span className="text-bk-muted font-mono text-[11px]"> · {e.points} pts</span>}
                </span>
              </label>
              {isLan && entry && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-sans text-[10px] uppercase text-bk-muted">
                    {entry.checkInStatus === "checked_in" ? "Checked in" : entry.checkInStatus === "no_show" ? "No-show" : "Not here yet"}
                  </span>
                  {entry.checkInStatus !== "checked_in" && (
                    <button type="button" onClick={() => setCheck(entry.id, "checked_in")} className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[10px] uppercase px-2.5 h-[30px]">
                      Check in
                    </button>
                  )}
                  {entry.checkInStatus === "pending" && (
                    <button type="button" onClick={() => setCheck(entry.id, "no_show")} className="border border-bk-live text-bk-live font-sans font-bold text-[10px] uppercase px-2.5 h-[30px]">
                      No-show
                    </button>
                  )}
                  {entry.checkInStatus !== "pending" && (
                    <button type="button" onClick={() => setCheck(entry.id, "pending")} className="font-sans text-[10px] underline text-bk-muted">
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="text-bk-live text-[12px] font-sans mt-3">{msg}</p>}
      <span className="hidden">{tournamentId}</span>
    </div>
  );
}

export default function HybridStageManager({
  tournamentId,
  stages,
  entrants,
  entries,
}: {
  tournamentId: string;
  stages: Stage[];
  entrants: Entrant[];
  entries: StageEntryRow[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function addStage() {
    if (!name.trim()) return;
    const r = await api(`/api/tournaments/${tournamentId}/stages`, "POST", { name });
    if (!r.ok) return setMsg(r.message);
    setName("");
    setMsg(null);
    router.refresh();
  }

  return (
    <div>
      <p className="font-sans font-medium text-bk-heading text-sm mb-1">Stages (hybrid)</p>
      <p className="font-sans text-[12px] text-bk-muted mb-3">
        Choose Online or LAN for each stage, then advance entries into the next one. Add at
        least one online and one LAN stage before publishing.
      </p>
      <div className="flex flex-col gap-3 mb-3">
        {stages.map((s) => (
          <StageCard
            key={s.id}
            tournamentId={tournamentId}
            stage={s}
            entrants={entrants}
            entries={entries.filter((e) => e.stageId === s.id)}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Online Qualifiers, LAN Finals"
          className={input}
        />
        <button
          type="button"
          onClick={addStage}
          className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-4 whitespace-nowrap"
        >
          + Add stage
        </button>
      </div>
      {msg && <p className="text-bk-live text-[12px] font-sans mt-2">{msg}</p>}
    </div>
  );
}
