"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Opening the page counts as reading: the list above still shows which were
// new for this visit, and the nav badge clears on the next load.
export default function MarkRead() {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/notifications/read", { method: "POST" }).then(() => router.refresh()).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [router]);
  return null;
}
