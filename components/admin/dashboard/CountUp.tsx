"use client";

// Shows a whole number and animates to it: from 0 the first time it appears,
// and from the number it was already showing when the value changes (so
// switching the dashboard filter slides the numbers instead of restarting).
// Jumps straight to the value when the device asks for reduced motion.
import { useEffect, useRef, useState } from "react";

export default function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const ms = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = ms === 0 ? 1 : Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      const v = Math.round(origin + (value - origin) * eased);
      from.current = v;
      setShown(v);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="tabular-nums">{shown.toLocaleString("en-US")}</span>;
}
