"use client";

import { useEffect, useState } from "react";

// Dates in the VIEWER's time zone. The server doesn't know it (a Pakistani
// evening can be the next day in UTC), so the server renders UTC and the
// browser then swaps in the local date; `time` carries the exact moment.
const FORMATS = {
  short: { month: "short", day: "numeric" },
  long: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
} as const;

export default function LocalDate({ iso, format = "short" }: { iso: string; format?: keyof typeof FORMATS }) {
  const date = new Date(iso);
  const [text, setText] = useState(() => date.toLocaleDateString("en-US", { ...FORMATS[format], timeZone: "UTC" }));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(new Date(iso).toLocaleString(undefined, FORMATS[format]));
  }, [iso, format]);

  return <time dateTime={iso}>{text}</time>;
}
