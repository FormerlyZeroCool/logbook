export function countOutputPoints(output: unknown): number {
  const value = output as { kind?: string; points?: unknown[]; series?: Array<{ points?: unknown[] }> };
  if (value.kind === 'series') return value.points?.length ?? 0;
  if (value.kind === 'series-set') return value.series?.reduce((total, series) => total + (series.points?.length ?? 0), 0) ?? 0;
  return 0;
}
