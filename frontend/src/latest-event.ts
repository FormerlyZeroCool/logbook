export function selectLatestEvent<T>(
  latestEvent: T | null | undefined,
  recentEvents: readonly T[] | null | undefined,
  listedEvents: readonly T[] | null | undefined
): T | null {
  return latestEvent ?? recentEvents?.[0] ?? listedEvents?.[0] ?? null;
}
