"use client";

import { useState } from "react";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "manager" | "staff";
  hasAccount: boolean;
}

export default function MembersManager({ initialMembers }: { initialMembers: Member[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"manager" | "staff">("staff");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/organizer/me/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, role }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error.message);
    } else {
      setMembers((m) => [...m, { id: body.id, email: body.email, name: body.name, role: body.role, hasAccount: !!body.userId }]);
      setEmail("");
      setName("");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/organizer/me/members/${id}`, { method: "DELETE" });
    if (res.ok) setMembers((m) => m.filter((x) => x.id !== id));
  }

  const input = "bg-bk-bg border border-bk-border text-bk-heading text-[13px] font-sans px-3 h-[38px]";

  return (
    <div>
      <form onSubmit={add} className="bg-bk-surface border border-bk-border p-4 mb-6 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} w-full`} />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full`} />
        </div>
        <div>
          <label className="block font-sans text-[11px] uppercase tracking-[0.8px] text-bk-muted mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as "manager" | "staff")} className={input}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
          </select>
        </div>
        <button disabled={busy} className="bg-white text-bk-bg font-sans font-bold text-[12px] uppercase tracking-[0.6px] px-4 h-[38px] disabled:opacity-50">
          Add member
        </button>
        {error && <p className="w-full font-sans text-[12px] text-bk-live">{error}</p>}
      </form>

      {members.length === 0 ? (
        <p className="font-sans text-[13px] text-bk-muted">No members yet.</p>
      ) : (
        <ul className="border border-bk-border divide-y divide-bk-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="font-sans text-[13px] text-bk-heading">{m.name || m.email}</p>
                <p className="font-sans text-[12px] text-bk-muted">
                  {m.name ? `${m.email} · ` : ""}
                  {m.role}
                  {m.hasAccount ? "" : " · no account yet"}
                </p>
              </div>
              <button onClick={() => remove(m.id)} className="font-sans text-[12px] text-bk-live underline">
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
