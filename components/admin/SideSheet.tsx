"use client";

// A panel that slides in from the right over the page: header with a cross, scrolling body,
// and a footer for the buttons. Escape or the dark area closes it (through onClose, so the
// caller can ask first when something would be lost).
import { useEffect, useId, useRef } from "react";
import { CloseIcon } from "./AdminIcons";

export default function SideSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key !== "Tab" || !panelRef.current) return;
      // Keep Tab inside the sheet.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 bottom-0 w-full sm:w-[600px] max-w-full bg-bk-bg border-l border-bk-border flex flex-col outline-none"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-bk-border">
          <div className="min-w-0">
            <h2 id={titleId} className="font-sans font-bold text-[18px] text-bk-heading">
              {title}
            </h2>
            {subtitle && <p className="font-sans text-[12px] text-bk-muted mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 grid place-items-center w-9 h-9 text-bk-muted hover:text-bk-heading hover:bg-bk-surface-hover">
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="border-t border-bk-border px-5 py-3 bg-bk-surface">{footer}</div>}
      </div>
    </div>
  );
}
