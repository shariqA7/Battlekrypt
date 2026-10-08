"use client";

// CurrencyInput.tsx
// Money is always {amount, currency} — never a bare number. See schema.prisma.

import { useState } from "react";
import { useEnabledCurrencies } from "@/lib/hooks/useEnabledCurrencies";


interface CurrencyInputProps {
  amount: number;
  currency: string;
  onChange: (amount: number, currency: string) => void;
}

export default function CurrencyInput({
  amount,
  currency,
  onChange,
}: CurrencyInputProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const enabled = useEnabledCurrencies();
  // A saved currency that was switched off later stays visible and selectable.
  const options = enabled.includes(currency) ? enabled : [currency, ...enabled];

  return (
    <div className="flex w-full max-w-[280px] relative">
      <input
        type="number"
        value={amount}
        onChange={(e) => onChange(Number(e.target.value), currency)}
        className="flex-1 bg-bk-bg border border-bk-border border-r-0 text-bk-heading font-mono text-[14px] px-3.5 py-2.5"
      />
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="bg-bk-surface border border-bk-border text-bk-gold-light font-sans font-bold text-[12px] tracking-[0.5px] px-3.5 flex items-center gap-1.5"
      >
        {currency}
        <ChevronDown />
      </button>

      {dropdownOpen && (
        <div className="absolute top-full right-0 mt-1 bg-bk-surface border border-bk-border z-10 min-w-[80px] max-h-[240px] overflow-y-auto">
          {options.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(amount, c);
                setDropdownOpen(false);
              }}
              className="w-full text-left px-3.5 py-2 text-[12px] font-sans text-bk-body hover:bg-bk-border hover:text-bk-heading"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
