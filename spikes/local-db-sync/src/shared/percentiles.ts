export interface LatencySummary {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  totalMs: number;
}

/** Nearest-rank percentiles, rounded to microseconds. */
export function summariseLatencies(samplesMs: readonly number[]): LatencySummary {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  const round = (ms: number) => Math.round(ms * 1000) / 1000;
  return {
    count: sorted.length,
    p50Ms: round(rank(50)),
    p95Ms: round(rank(95)),
    p99Ms: round(rank(99)),
    maxMs: round(sorted.at(-1) ?? 0),
    totalMs: round(sorted.reduce((sum, ms) => sum + ms, 0)),
  };
}
