// CurrencyInput.tsx
// Money is always {amount, currency} — never a bare number. See schema.prisma.

import { useState } from "react";

const SUPPORTED_CURRENCIES = ["PKR", "USD", "INR", "SAR", "AED"];

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

  return (
    <div className="flex w-full max-w-[280px] relative">
      <input
        type="number"
        value={amount}
        onChange={(e) => onChange(Number(e.target.value), currency)}
        className="flex-1 bg-[#0B0C10] border border-[#39342A] border-r-0 text-[#EAE1D3] font-mono text-[14px] px-3.5 py-2.5"
      />
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="bg-[#1F2833] border border-[#39342A] text-[#FFE7AD] font-sans font-bold text-[12px] tracking-[0.5px] px-3.5 flex items-center gap-1.5"
      >
        {currency}
        <ChevronDown />
      </button>

      {dropdownOpen && (
        <div className="absolute top-full right-0 mt-1 bg-[#1F2833] border border-[#39342A] z-10 min-w-[80px]">
          {SUPPORTED_CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(amount, c);
                setDropdownOpen(false);
              }}
              className="w-full text-left px-3.5 py-2 text-[12px] font-sans text-[#D1C5AE] hover:bg-[#39342A] hover:text-[#EAE1D3]"
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
