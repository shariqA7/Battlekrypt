"use client";

import { useEffect, useState } from "react";
import { LAUNCH_CURRENCIES } from "@/lib/money";

// Currencies organizers can currently pick (admin-managed). Starts with the
// launch five so the dropdown is never empty while the list loads.
export function useEnabledCurrencies(): string[] {
  const [codes, setCodes] = useState<string[]>([...LAUNCH_CURRENCIES]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/currencies")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: { code: string }[] | null) => {
        if (!cancelled && list?.length) setCodes(list.map((c) => c.code));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return codes;
}
