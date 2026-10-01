"use client";

import { useEffect } from "react";

// Tells the server a page was opened so the admin panel can show who visits,
// from where and on what device. Renders nothing; failures are ignored.
export default function SessionBeacon() {
  useEffect(() => {
    fetch("/api/analytics/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: window.location.pathname,
        referrer: document.referrer ? new URL(document.referrer).hostname : "",
      }),
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
