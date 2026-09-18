"use client";

import { useState } from "react";

interface Stage {
  id: string;
  name: string;
  roomId: string | null;
}

export default function RoomReveal({ stages }: { stages: Stage[] }) {
  const [rooms, setRooms] = useState<Record<string, { roomId: string; roomPassword: string | null } | string>>({});

  async function checkRoom(stageId: string) {
    const res = await fetch(`/api/stages/${stageId}/room`);
    const body = await res.json();

    if (!res.ok) {
      if (body.error?.code === "not_yet_revealed") {
        setRooms((prev) => ({
          ...prev,
          [stageId]: `Reveals at ${new Date(body.error.revealAt).toLocaleString()}`,
        }));
      } else {
        setRooms((prev) => ({ ...prev, [stageId]: body.error?.message ?? "Not available" }));
      }
      return;
    }

    setRooms((prev) => ({ ...prev, [stageId]: body }));
  }

  const stagesWithRooms = stages.filter((s) => s.roomId);
  if (stagesWithRooms.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="font-sans font-medium text-bk-heading text-sm mb-2">
        Room details
      </p>
      <div className="flex flex-col gap-2">
        {stagesWithRooms.map((stage) => {
          const result = rooms[stage.id];
          return (
            <div key={stage.id} className="bg-bk-surface p-3 flex items-center justify-between">
              <span className="font-sans text-bk-body text-sm">{stage.name}</span>
              {!result && (
                <button
                  onClick={() => checkRoom(stage.id)}
                  className="text-bk-gold-light text-[12px] font-sans underline"
                >
                  Reveal room
                </button>
              )}
              {typeof result === "string" && (
                <span className="text-bk-muted text-[12px] font-sans">{result}</span>
              )}
              {typeof result === "object" && (
                <span className="font-mono text-bk-gold-light text-[13px]">
                  {result.roomId} {result.roomPassword && `· ${result.roomPassword}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
