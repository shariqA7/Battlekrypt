"use client";

import { useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

export const fieldClass =
  "w-full bg-bk-surface border border-bk-border text-bk-heading placeholder:text-bk-muted text-[14px] font-sans px-4 h-[50px] rounded-xl outline-none transition-all focus:border-bk-gold-light focus:shadow-[0_0_0_3px_rgba(244,200,66,0.12)] disabled:opacity-60";

export function Label({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <span className="block font-sans text-[11px] tracking-[0.8px] uppercase text-bk-muted mb-1.5">
      {children}
      {optional && <span className="normal-case tracking-normal text-bk-faint"> (optional)</span>}
    </span>
  );
}

export function TextField({
  label,
  optional,
  className = "",
  ...rest
}: { label: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <Label optional={optional}>{label}</Label>
      <input className={fieldClass} {...rest} />
    </label>
  );
}

export function SelectField({
  label,
  optional,
  className = "",
  children,
  ...rest
}: { label: string; optional?: boolean; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={`block ${className}`}>
      <Label optional={optional}>{label}</Label>
      <select className={`${fieldClass} appearance-none pr-9 bg-no-repeat`} {...rest}>
        {children}
      </select>
    </label>
  );
}

export function PasswordField({
  label,
  className = "",
  ...rest
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <label className={`block ${className}`}>
      <Label>{label}</Label>
      <span className="relative block">
        <input className={`${fieldClass} pr-12`} type={shown ? "text" : "password"} {...rest} />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-bk-muted hover:text-bk-heading"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            {shown && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
          </svg>
        </button>
      </span>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        className="mt-0.5 w-[18px] h-[18px] shrink-0 accent-[var(--bk-text-gold-light)]"
      />
      <span className="font-sans text-[13px] leading-[1.45] text-bk-body">{children}</span>
    </label>
  );
}
