"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Linked {
  institutionId: string;
  name: string;
  role: "cohost" | "guest";
  status: "pending" | "accepted" | "declined";
  maxEntries: number | null;
}

const selectClass =
  "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";

// Host-only: add co-host institutes (they approve their OWN players) or guest
// institutes (their players may enter, the host approves them).
export default function InstitutesPanel({
  tournamentId,
  hostInstitute,
  hostInstituteId,
  defaultLimit,
  usage,
  initial,
}: {
  tournamentId: string;
  hostInstitute: { name: string; verified: boolean } | null;
  hostInstituteId: string | null;
  // Cap on entries per institute for the whole tournament (null = no cap).
  defaultLimit: number | null;
  // Live entries per institute id.
  usage: Record<string, number>;
  initial: Linked[];
}) {
  const router = useRouter();
  const [options, setOptions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState("");
  const [role, setRole] = useState<"cohost" | "guest">("cohost");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [defaultInput, setDefaultInput] = useState(defaultLimit?.toString() ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(initial.map((l) => [l.institutionId, l.maxEntries?.toString() ?? ""]))
  );

  useEffect(() => {
    fetch("/api/institutions")
      .then((r) => r.json())
      .then((j) => setOptions(j.data ?? []))
      .catch(() => {});
  }, []);

  const taken = new Set(initial.map((l) => l.institutionId));
  const available = options.filter((o) => !taken.has(o.id) && o.name !== hostInstitute?.name);

  async function call(method: "POST" | "DELETE", body: Record<string, string>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/institutions`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      return;
    }
    setInstitutionId("");
    router.refresh();
  }

  async function saveLimit(institutionId: string | null, value: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tournaments/${tournamentId}/institutions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ institutionId, maxEntries: value.trim() === "" ? null : Number(value) }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error?.message ?? "Something went wrong.");
      return;
    }
    router.refresh();
  }

  const limitInput =
    "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-2 h-[34px] w-[72px]";

  return (
    <section className="mt-10 border border-bk-border p-4">
      <p className="font-sans font-medium text-bk-heading text-sm">Participating institutes</p>
      {!hostInstitute?.verified ? (
        <p className="font-sans text-[12px] text-bk-live mt-2">
          Your institute isn&apos;t verified yet, so players can&apos;t enter this tournament.{" "}
          <a href="/organizer/dashboard/institute" className="underline">
            Set up your institute
          </a>
          .
        </p>
      ) : (
        <p className="font-sans text-[12px] text-bk-muted mt-1">
          Host: {hostInstitute.name}. <strong>Co-hosts</strong> approve their own institute&apos;s
          players. <strong>Guests</strong> can enter, but you approve them.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mt-3 font-sans text-[12px] text-bk-muted">
        <span>Entries allowed per institute (solo players or teams):</span>
        <input
          inputMode="numeric"
          value={defaultInput}
          onChange={(e) => setDefaultInput(e.target.value.replace(/\D/g, ""))}
          placeholder="No limit"
          className={limitInput}
        />
        <button
          disabled={busy}
          onClick={() => saveLimit(null, defaultInput)}
          className="border border-bk-border text-bk-heading font-bold text-[11px] px-3 h-[34px] disabled:opacity-50"
        >
          Save
        </button>
        {hostInstituteId && usage[hostInstituteId] !== undefined && (
          <span>· {hostInstitute?.name}: {usage[hostInstituteId]} used</span>
        )}
      </div>

      <ul className="mt-3 space-y-2">
        {initial.map((l) => (
          <li key={l.institutionId} className="flex items-center justify-between gap-3 font-sans text-[13px]">
            <span className="text-bk-heading break-words">
              {l.name}{" "}
              <span className="text-bk-muted text-[11px]">
                · {usage[l.institutionId] ?? 0} used
                {(l.maxEntries ?? defaultLimit) !== null && ` of ${l.maxEntries ?? defaultLimit}`}
              </span>{" "}
              <span className="text-bk-muted text-[11px]">
                · {l.role === "cohost" ? "co-host" : "guest"}
                {l.role === "cohost" && ` · ${l.status === "pending" ? "invite pending" : l.status}`}
              </span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <input
                inputMode="numeric"
                value={overrides[l.institutionId] ?? ""}
                onChange={(e) =>
                  setOverrides((o) => ({ ...o, [l.institutionId]: e.target.value.replace(/\D/g, "") }))
                }
                placeholder="Limit"
                aria-label={`Entry limit for ${l.name}`}
                className={limitInput}
              />
              <button
                disabled={busy}
                onClick={() => saveLimit(l.institutionId, overrides[l.institutionId] ?? "")}
                className="border border-bk-border text-bk-heading text-[11px] px-2 h-[34px] disabled:opacity-50"
              >
                Set
              </button>
            <button
              disabled={busy}
              onClick={() => call("DELETE", { institutionId: l.institutionId })}
              className="text-bk-live text-[11px] underline disabled:opacity-50"
            >
              Remove
            </button>
            </span>
          </li>
        ))}
        {initial.length === 0 && (
          <li className="font-sans text-[12px] text-bk-muted">No other institutes added.</li>
        )}
      </ul>

      {hostInstitute?.verified && (
        <div className="flex flex-wrap gap-2 mt-4">
          <select value={institutionId} onChange={(e) => setInstitutionId(e.target.value)} className={selectClass}>
            <option value="">Add an institute…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value as "cohost" | "guest")} className={selectClass}>
            <option value="cohost">Co-host</option>
            <option value="guest">Guest</option>
          </select>
          <button
            disabled={busy || !institutionId}
            onClick={() => call("POST", { institutionId, role })}
            className="bg-bk-gold-light text-black font-bold text-[12px] px-4 h-[38px] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}
      {error && <p className="text-bk-live text-[12px] mt-2">{error}</p>}
    </section>
  );
}
