"use client";

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-bk-primary text-bk-on-primary font-sans font-bold text-[11px] tracking-[0.8px] uppercase px-4 py-2"
    >
      Print or save as PDF
    </button>
  );
}
