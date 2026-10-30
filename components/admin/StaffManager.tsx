"use client";

// Super admin's staff screen: the team list, add someone, edit what they can control.
// All the rules are enforced by /api/admin/staff; this just drives it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import {
  ROLE_TEMPLATES, STAFF_PERMISSIONS, STAFF_ROLE_LABELS,
  type StaffAccessLevel, type StaffGrants, type StaffRoleName,
} from "@/lib/staff-permissions";
import type { StaffRow } from "@/lib/services/staff";

type Level = StaffAccessLevel | "none";
const GROUPS = ["Review", "People", "Money", "Platform"] as const;

function PermissionGrid({ grants, onChange }: { grants: StaffGrants; onChange: (g: StaffGrants) => void }) {
  const set = (key: string, level: Level) => {
    const next = { ...grants } as Record<string, StaffAccessLevel>;
    if (level === "none") delete next[key]; else next[key] = level;
    onChange(next as StaffGrants);
  };
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => (
        <fieldset key={g}>
          <legend className="font-sans font-bold text-[10px] uppercase tracking-[1.6px] text-bk-faint mb-1">{g}</legend>
          <ul className="divide-y divide-bk-border-soft border border-bk-border-soft">
            {STAFF_PERMISSIONS.filter((p) => p.group === g).map((p) => {
              const value: Level = grants[p.key] ?? "none";
              return (
                <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-sans text-[13px] text-bk-heading">{p.label}</p>
                    <p className="font-sans text-[11px] text-bk-muted">{p.hint}</p>
                  </div>
                  <div role="radiogroup" aria-label={`${p.label} access`} className="flex border border-bk-border text-[11px] font-sans font-bold">
                    {(["none", "view", "edit"] as Level[]).map((l) => (
                      <button
                        key={l}
                        type="button"
                        role="radio"
                        aria-checked={value === l}
                        onClick={() => set(p.key, l)}
                        className={`px-3 min-h-[36px] capitalize ${value === l ? (l === "none" ? "bg-bk-surface-hover text-bk-heading" : "bg-bk-primary text-bk-on-primary") : "text-bk-muted hover:text-bk-heading"}`}
                      >
                        {l === "none" ? "No access" : l === "view" ? "View" : "View & edit"}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

function summary(row: StaffRow) {
  if (row.role === "super_admin") return "Everything, plus staff management";
  const parts = STAFF_PERMISSIONS.filter((p) => row.grants[p.key]).map((p) => (row.grants[p.key] === "view" ? `${p.label} (view)` : p.label));
  return parts.length ? parts.join(", ") : "No access yet";
}

export default function StaffManager({ initial, meId }: { initial: StaffRow[]; meId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRoleName>("manager");
  const [grants, setGrants] = useState<StaffGrants>(ROLE_TEMPLATES.manager);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error?.message ?? "Something went wrong."); return false; }
      router.refresh();
      return true;
    } finally { setBusy(false); }
  }

  function startNew() { setEditing("new"); setEmail(""); setRole("manager"); setGrants(ROLE_TEMPLATES.manager); setError(null); }
  function startEdit(r: StaffRow) { setEditing(r.id); setRole(r.role); setGrants(r.grants); setError(null); }
  function pickRole(r: StaffRoleName) { setRole(r); if (r !== "super_admin") setGrants(ROLE_TEMPLATES[r]); }

  async function save() {
    const body = role === "super_admin" ? { role, grants: {} } : { role, grants };
    const ok = editing === "new" ? await call("/api/admin/staff", "POST", { email, ...body }) : await call(`/api/admin/staff/${editing}`, "PATCH", body);
    if (ok) setEditing(null);
  }

  const editingRow = initial.find((r) => r.id === editing);

  return (
    <div className="space-y-5">
      {error && <div role="alert" className="border border-bk-live/50 bg-bk-surface px-4 py-2.5 font-sans text-[13px] text-bk-heading">{error}</div>}

      <div className="flex items-center justify-between gap-3">
        <p className="font-sans text-[13px] text-bk-body">{initial.length} on the team</p>
        {editing === null && <Button size="sm" onClick={startNew}>Add staff</Button>}
      </div>

      {editing !== null && (
        <Panel className="p-4 sm:p-5 space-y-5">
          <p className="font-sans font-bold text-bk-heading">{editing === "new" ? "Add a staff member" : `Edit ${editingRow?.name ?? "staff member"}`}</p>
          {editing === "new" && (
            <label className="block">
              <span className="font-sans text-[12px] text-bk-muted">Account email (they must already have an account)</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full max-w-md bg-bk-bg border border-bk-border px-3 min-h-[44px] font-sans text-[14px] text-bk-heading" />
            </label>
          )}
          <div>
            <p className="font-sans text-[12px] text-bk-muted mb-1">Role (a starting point: you can change every permission below)</p>
            <div className="flex gap-2 flex-wrap">
              {(["manager", "admin", "super_admin"] as StaffRoleName[]).map((r) => (
                <Button key={r} size="sm" variant={role === r ? "primary" : "outline"} onClick={() => pickRole(r)}>{STAFF_ROLE_LABELS[r]}</Button>
              ))}
            </div>
          </div>
          {role === "super_admin" ? (
            <p className="font-sans text-[13px] text-bk-body">Super admins can open everything and manage staff.</p>
          ) : (
            <PermissionGrid grants={grants} onChange={setGrants} />
          )}
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || (editing === "new" && !email.trim())}>{busy ? "Saving…" : "Save"}</Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
          </div>
        </Panel>
      )}

      <Panel>
        <ul className="divide-y divide-bk-border-soft">
          {initial.map((r) => {
            const me = r.id === meId;
            return (
              <li key={r.id} className="p-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-sans font-bold text-[14px] text-bk-heading">
                    {r.name} {me && <span className="font-normal text-bk-muted">(you)</span>}
                  </p>
                  <p className="font-mono text-[11px] text-bk-muted">{r.email ?? "no email"}</p>
                  <p className="font-sans text-[12px] text-bk-body mt-1">
                    <span className="font-bold">{STAFF_ROLE_LABELS[r.role]}</span>
                    {!r.active && <span className="ml-2 text-bk-amber">Suspended</span>}
                    <span className="text-bk-muted"> · {summary(r)}</span>
                  </p>
                  {(r.addedAt || r.addedBy) && (
                    <p className="font-sans text-[11px] text-bk-faint mt-0.5">
                      Added{r.addedBy ? ` by ${r.addedBy}` : ""}{r.addedAt ? ` on ${r.addedAt.slice(0, 10)}` : ""}
                    </p>
                  )}
                </div>
                {!me && (
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => startEdit(r)} disabled={busy}>Edit access</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => call(`/api/admin/staff/${r.id}`, "PATCH", { active: !r.active })}>
                      {r.active ? "Suspend" : "Reactivate"}
                    </Button>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => { if (confirm(`Remove ${r.name} from staff? Their account stays; only admin access goes.`)) call(`/api/admin/staff/${r.id}`, "DELETE"); }}>
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
