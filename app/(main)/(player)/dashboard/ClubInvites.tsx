"use client";

// Player-side: current club spot + pending club invitations.
// Accepting an invite removes the player from any club they're already on.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface ClubRef {
  id: string;
  clubName: string;
  logoUrl: string | null;
}
interface Membership {
  role: "player" | "substitute";
  club: ClubRef;
  game: { id: string; name: string };
  team: { id: string; name: string } | null;
}
interface Invite {
  id: string;
  role: "player" | "substitute";
  club: ClubRef;
  game: { id: string; name: string };
  team: { id: string; name: string } | null;
}

const btn =
  "font-sans font-bold text-[11px] tracking-[0.5px] uppercase px-3 py-1.5 disabled:opacity-50";

export default function ClubInvites({
  membership,
  invites,
}: {
  membership: Membership | null;
  invites: Invite[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, method: "POST" | "DELETE", key: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error?.message ?? "Something went wrong.");
    }
    setBusy(null);
    router.refresh();
  }

  function describe(x: { role: string; game: { name: string }; team: { name: string } | null }) {
    const where = x.team ? `${x.team.name} · ${x.game.name}` : `${x.game.name} (solo)`;
    return x.role === "substitute" ? `${where} · substitute` : where;
  }

  if (!membership && invites.length === 0) return null;

  return (
    <section className="mb-8">
      {membership && (
        <div className="bg-bk-surface border border-bk-border p-4 mb-3 flex items-center justify-between">
          <div>
            <p className="font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1">
              My club
            </p>
            <p className="font-sans font-medium text-bk-heading text-sm">
              {membership.club.clubName}
            </p>
            <p className="font-sans text-bk-muted text-xs mt-0.5">{describe(membership)}</p>
          </div>
          <button
            type="button"
            disabled={busy === "leave"}
            onClick={() => {
              if (window.confirm(`Leave ${membership.club.clubName}?`)) {
                call("/api/players/me/club", "DELETE", "leave");
              }
            }}
            className="border border-bk-border text-bk-body font-sans text-[10px] uppercase tracking-[0.5px] px-2 py-1"
          >
            Leave club
          </button>
        </div>
      )}

      {invites.length > 0 && (
        <>
          <p className="font-sans font-medium text-bk-heading text-sm mb-2">
            Club invitations ({invites.length})
          </p>
          <div className="flex flex-col gap-2">
            {invites.map((i) => (
              <div
                key={i.id}
                className="bg-bk-surface border border-bk-border p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-sans text-bk-heading text-sm">{i.club.clubName}</p>
                  <p className="font-sans text-bk-muted text-xs mt-0.5">{describe(i)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (
                        membership &&
                        !window.confirm(
                          `Joining ${i.club.clubName} will remove you from ${membership.club.clubName}. Continue?`
                        )
                      ) {
                        return;
                      }
                      call(`/api/players/me/club-invites/${i.id}/accept`, "POST", i.id);
                    }}
                    className={`${btn} bg-white text-bk-bg`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      call(`/api/players/me/club-invites/${i.id}/decline`, "POST", i.id)
                    }
                    className={`${btn} border border-bk-border text-bk-body`}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <p className="text-bk-live text-[12px] font-sans mt-2">{error}</p>}
    </section>
  );
}
