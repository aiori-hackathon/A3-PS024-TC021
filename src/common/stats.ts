export function percentile(sorted: number[], p: number): number {
  const i = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, i))];
}

export function summarize(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean, p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] };
}
