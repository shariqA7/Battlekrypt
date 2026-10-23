"use client";

// Time-range picker as a dropdown menu (listbox). Click or Enter/Space opens it;
// arrow keys move, Enter picks, Escape or an outside click closes.
import { useEffect, useId, useRef, useState } from "react";
import { CalendarIcon, CheckIcon } from "@/components/ui/icons";

type Option = { key: string; label: string };

const Chevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function RangeDropdown({
  value,
  options,
  onChange,
  label = "Time range",
}: {
  value: string;
  options: Option[];
  onChange: (key: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted option while open
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = options.find((o) => o.key === value) ?? options[0];

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function openMenu() {
    setActive(Math.max(0, options.findIndex((o) => o.key === value)));
    setOpen(true);
  }

  function pick(i: number) {
    setOpen(false);
    button.current?.focus();
    if (options[i].key !== value) onChange(options[i].key);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      button.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className="relative w-full sm:w-52" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 bg-bk-surface border font-sans text-[13px] text-bk-heading transition-colors hover:bg-bk-surface-hover ${
          open ? "border-bk-gold-light" : "border-bk-border"
        }`}
      >
        <span className="text-bk-gold-light"><CalendarIcon size={16} /></span>
        <span className="flex-1 text-left font-bold">{current.label}</span>
        <span className="text-bk-muted"><Chevron open={open} /></span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          className="bk-rise absolute right-0 left-0 top-full mt-1 z-30 bg-bk-surface border border-bk-border shadow-[0_12px_32px_rgba(0,0,0,0.35)] py-1"
          style={{ animationDuration: "0.15s" }}
        >
          {options.map((o, i) => {
            const selected = o.key === value;
            return (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onClick={() => pick(i)}
                onPointerMove={() => setActive(i)}
                className={`flex items-center gap-2 px-3 min-h-[42px] cursor-pointer font-sans text-[13px] ${
                  i === active ? "bg-bk-surface-hover" : ""
                } ${selected ? "text-bk-gold-light font-bold" : "text-bk-body"}`}
              >
                <span className="flex-1">{o.label}</span>
                {selected && <CheckIcon size={14} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
