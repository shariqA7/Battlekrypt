// "Nice" axis for count charts. The top of the axis and the gap between ticks
// follow the biggest value, so the scale re-fits itself as numbers grow:
//   biggest 8   -> 0 2 4 6 8
//   biggest 45  -> 0 10 20 30 40 50
//   biggest 80  -> 0 10 20 30 40 50 60 70 80
//   biggest 640 -> 0 100 200 ... 700
// Steps are 2, 5, 10, 20, 50, 100 ... (1, 2 or 5 times a power of ten, but never
// a gap of 1), using the smallest step that needs at most `maxIntervals` gaps.
const MAX_INTERVALS = 8;

export function niceScale(biggest: number, maxIntervals = MAX_INTERVALS) {
  const top = Math.max(1, Math.ceil(biggest));
  let step = 2;
  outer: for (let pow = 1; ; pow *= 10) {
    for (const m of [1, 2, 5]) {
      step = m * pow;
      if (step < 2) continue; // no gap of 1: counts under 10 go 0, 2, 4, ...
      if (Math.ceil(top / step) <= maxIntervals) break outer;
    }
  }
  const max = Math.ceil(top / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  return { max, step, ticks };
}

// 1200 -> "1.2K", 3000000 -> "3M"; small numbers are left alone.
export function tickLabel(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}
