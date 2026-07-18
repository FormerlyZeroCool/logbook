export type TimedPoint<T> = T & { timestamp: number };

const MIN_AXIS_PADDING_MS = 60_000;
const SINGLE_POINT_PADDING_MS = 30 * 60_000;

export function buildTimedPoints<T>(
  points: readonly T[],
  getTimestamp: (point: T) => string | number
): TimedPoint<T>[] {
  return points
    .map((point: T): TimedPoint<T> | null => {
      const rawTimestamp = getTimestamp(point);
      const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : Date.parse(rawTimestamp);
      return Number.isFinite(timestamp) ? { ...point, timestamp } : null;
    })
    .filter((point: TimedPoint<T> | null): point is TimedPoint<T> => point !== null)
    .sort((left: TimedPoint<T>, right: TimedPoint<T>) => left.timestamp - right.timestamp);
}

export function buildTimeAxisDomain(points: readonly { timestamp: number }[]): [number, number] {
  if (!points.length) return [0, 1];

  const minimum = points[0]!.timestamp;
  const maximum = points[points.length - 1]!.timestamp;
  if (minimum === maximum) {
    return [minimum - SINGLE_POINT_PADDING_MS, maximum + SINGLE_POINT_PADDING_MS];
  }

  const padding = Math.max(MIN_AXIS_PADDING_MS, (maximum - minimum) * 0.025);
  return [minimum - padding, maximum + padding];
}
