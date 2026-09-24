"use client";

// Replaces the old row of separate text links (Admin / Organizer /
// Dashboard / Logout) with a single avatar that opens a dropdown — same
// pattern as the reference screenshot. Kept the Admin/Organizer shortcuts
// (as rows inside the dropdown, mirroring the reference's "Company" row)
// rather than dropping that navigation entirely, since admins/organizers
// still need a fast way to reach those areas.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/lib/actions/auth";

interface UserMenuProps {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  isOrganizer: boolean;
}

export default function UserMenu({
  displayName,
  email,
  avatarUrl,
  isAdmin,
  isOrganizer,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-9 h-9 rounded-full overflow-hidden border border-bk-border shrink-0"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-bk-gold-gradient flex items-center justify-center font-sans font-bold text-[13px] text-bk-bg">
            {initial}
          </div>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-bk-border bg-bk-surface overflow-hidden z-50"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 40px rgba(244,200,66,0.06)" }}
        >
          <div className="flex items-center gap-3 p-4 border-b border-bk-border">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-bk-border shrink-0">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-bk-gold-gradient flex items-center justify-center font-sans font-bold text-[14px] text-bk-bg">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="font-sans font-bold text-[13px] text-bk-heading truncate">
                  {displayName}
                </p>
                {isAdmin && (
                  <span className="shrink-0 bg-bk-gold-gradient text-bk-bg font-sans font-bold text-[9px] tracking-[0.5px] uppercase px-1.5 py-0.5 rounded-full">
                    Admin
                  </span>
                )}
              </div>
              <p className="font-sans text-[12px] text-bk-muted truncate">{email}</p>
            </div>
          </div>

          {(isAdmin || isOrganizer) && (
            <div className="border-b border-bk-border py-1">
              {isAdmin && (
                <MenuLink href="/admin" onNavigate={() => setOpen(false)}>
                  <ShieldIcon />
                  Admin panel
                </MenuLink>
              )}
              {isOrganizer && (
                <MenuLink href="/organizer/dashboard" onNavigate={() => setOpen(false)}>
                  <TrophyIcon />
                  Organizer dashboard
                </MenuLink>
              )}
            </div>
          )}

          <div className="py-1">
            <MenuLink href="/dashboard" onNavigate={() => setOpen(false)}>
              <TicketIcon />
              My matches
            </MenuLink>
            <MenuLink href="/dashboard/profile" onNavigate={() => setOpen(false)}>
              <UserIcon />
              Profile
            </MenuLink>
            <form action={logout}>
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-4 py-2.5 font-sans text-[13px] text-bk-body hover:bg-white/[0.04] transition-colors text-left"
              >
                <LogoutIcon />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-2.5 font-sans text-[13px] text-bk-body hover:bg-white/[0.04] transition-colors"
    >
      {children}
    </Link>
  );
}

function TicketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3V9z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h8v5a4 4 0 0 1-8 0V4z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 5H5a1 1 0 0 0-1 1c0 2.5 1.8 4 4 4M16 5h3a1 1 0 0 1 1 1c0 2.5-1.8 4-4 4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 13v3M9 20h6M10 16h4v4h-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
