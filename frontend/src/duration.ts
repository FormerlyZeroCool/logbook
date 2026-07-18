import type { DurationSeriesPoint } from './types';

export interface DurationLike {
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  ongoing: boolean;
}

function nonNegativeFinite(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

export function getDisplayDurationSeconds(event: DurationLike, nowMs: number = Date.now()): number | null {
  const startedAtMs = Date.parse(event.startedAt);
  if (!Number.isFinite(startedAtMs)) return null;

  if (event.ongoing || event.endedAt === null) {
    return nonNegativeFinite((nowMs - startedAtMs) / 1000);
  }

  if (event.durationSeconds !== null) {
    return nonNegativeFinite(event.durationSeconds);
  }

  const endedAtMs = Date.parse(event.endedAt);
  if (!Number.isFinite(endedAtMs)) return null;
  return nonNegativeFinite((endedAtMs - startedAtMs) / 1000);
}

export type EventIntervalPoint = DurationSeriesPoint & {
  nextEventId: string;
  nextStartedAt: string;
  intervalSeconds: number;
  intervalMinutes: number;
};

export type EventRatePoint = DurationSeriesPoint & {
  displayDurationSeconds: number;
  valuePerMinute: number;
};

type ParsedPoint = {
  point: DurationSeriesPoint;
  startedAtMs: number;
};

function parsedPoints(points: readonly DurationSeriesPoint[]): ParsedPoint[] {
  return points
    .map((point: DurationSeriesPoint): ParsedPoint | null => {
      const startedAtMs = Date.parse(point.startedAt);
      return Number.isFinite(startedAtMs) ? { point, startedAtMs } : null;
    })
    .filter((entry: ParsedPoint | null): entry is ParsedPoint => entry !== null)
    .sort((left: ParsedPoint, right: ParsedPoint) => left.startedAtMs - right.startedAtMs);
}

export function buildEventIntervalPoints(points: readonly DurationSeriesPoint[]): EventIntervalPoint[] {
  const sorted = parsedPoints(points);
  return sorted.slice(0, -1).map((entry: ParsedPoint, index: number): EventIntervalPoint => {
    const next = sorted[index + 1]!;
    const intervalSeconds = Math.max(0, (next.startedAtMs - entry.startedAtMs) / 1000);
    return {
      ...entry.point,
      nextEventId: next.point.eventId,
      nextStartedAt: next.point.startedAt,
      intervalSeconds,
      intervalMinutes: intervalSeconds / 60
    };
  });
}

export function buildEventRatePoints(
  points: readonly DurationSeriesPoint[],
  nowMs: number = Date.now()
): EventRatePoint[] {
  return parsedPoints(points)
    .map(({ point }: ParsedPoint): EventRatePoint | null => {
      if (point.value === null || !Number.isFinite(point.value)) return null;
      const displayDurationSeconds = getDisplayDurationSeconds(point, nowMs);
      if (displayDurationSeconds === null || displayDurationSeconds <= 0) return null;

      const valuePerMinute = point.value / (displayDurationSeconds / 60);
      if (!Number.isFinite(valuePerMinute)) return null;

      return {
        ...point,
        displayDurationSeconds,
        valuePerMinute
      };
    })
    .filter((point: EventRatePoint | null): point is EventRatePoint => point !== null);
}
