"use client";

import { useState } from "react";

interface Stage {
  id: string;
  name: string;
  order: number;
  roomId: string | null;
  roomPassword: string | null;
  roomRevealAt: Date | null;
  status: string;
}

export default function StageManager({
  tournamentId,
  initialStages,
}: {
  tournamentId: string;
  initialStages: Stage[];
}) {
  const [stages, setStages] = useState(initialStages);
  const [newStageName, setNewStageName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [revealAt, setRevealAt] = useState("");

  async function addStage() {
    if (!newStageName.trim()) return;
    const res = await fetch(`/api/tournaments/${tournamentId}/stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newStageName }),
    });
    if (res.ok) {
      const stage = await res.json();
      setStages((prev) => [...prev, stage]);
      setNewStageName("");
    }
  }

  async function saveRoom(stageId: string) {
    const res = await fetch(`/api/stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        roomPassword,
        roomRevealAt: revealAt ? new Date(revealAt).toISOString() : undefined,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setStages((prev) => prev.map((s) => (s.id === stageId ? updated : s)));
      setEditing(null);
    }
  }

  const inputClass =
    "bg-bk-bg border border-bk-border text-bk-heading text-[12px] font-sans px-2.5 h-[32px] w-full";

  return (
    <div>
      <p className="font-sans font-medium text-bk-heading text-sm mb-3">Stages</p>

      <div className="flex flex-col gap-2 mb-3">
        {stages.map((stage) => (
          <div key={stage.id} className="bg-bk-surface border border-bk-border p-3">
            <div className="flex items-center justify-between">
              <p className="font-sans text-bk-heading text-sm">{stage.name}</p>
              {stage.roomId ? (
                <span className="text-[11px] font-mono text-bk-gold-light">
                  Room {stage.roomId} set
                </span>
              ) : (
                <button
                  onClick={() => {
                    setEditing(stage.id);
                    setRoomId("");
                    setRoomPassword("");
                    setRevealAt("");
                  }}
                  className="text-[11px] font-sans text-bk-gold-light underline"
                >
                  Set room
                </button>
              )}
            </div>

            {editing === stage.id && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                <input
                  placeholder="Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className={inputClass}
                />
                <input
                  placeholder="Password"
                  value={roomPassword}
                  onChange={(e) => setRoomPassword(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="datetime-local"
                  value={revealAt}
                  onChange={(e) => setRevealAt(e.target.value)}
                  className={inputClass}
                />
                <button
                  onClick={() => saveRoom(stage.id)}
                  className="col-span-3 bg-white text-bk-bg font-sans font-bold text-[11px] tracking-[0.5px] uppercase py-2 mt-1"
                >
                  Save room details
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={newStageName}
          onChange={(e) => setNewStageName(e.target.value)}
          placeholder="e.g. Qualifiers, Semis, Finals"
          className={inputClass}
        />
        <button
          onClick={addStage}
          className="bg-bk-surface border border-bk-border text-bk-body font-sans text-[11px] uppercase tracking-[0.5px] px-4 whitespace-nowrap"
        >
          + Add stage
        </button>
      </div>
    </div>
  );
}
