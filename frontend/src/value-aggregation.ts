import type { SeriesPoint, ValueSeriesPoint } from './types';

export type ValueAggregationOption = { value: 'events' | '15 minutes' | '1 hour' | '6 hours' | '1 day' | '1 week'; label: string };

export const valueAggregationOptions: readonly ValueAggregationOption[] = [
  { value: 'events', label: 'Individual events' },
  { value: '15 minutes', label: '15 minutes' },
  { value: '1 hour', label: '1 hour' },
  { value: '6 hours', label: '6 hours' },
  { value: '1 day', label: '1 day' },
  { value: '1 week', label: '1 week' }
] as const;

export type ValueAggregation = ValueAggregationOption['value'];

export type ValueChartPoint = {
  at: string;
  displayValue: number;
  eventCount: number;
  eventId: string | null;
  endedAt: string | null;
  textValue: string | null;
  note: string | null;
  durationSeconds: number | null;
  ongoing: boolean;
};

export function isBucketedValueAggregation(value: ValueAggregation): boolean {
  return value !== 'events';
}

export function getSeriesBucket(valueAggregation: ValueAggregation, fallbackBucket: string): string {
  return isBucketedValueAggregation(valueAggregation) ? valueAggregation : fallbackBucket;
}

export function formatValueAggregation(valueAggregation: ValueAggregation): string {
  return valueAggregationOptions.find((option: ValueAggregationOption) => option.value === valueAggregation)?.label ?? valueAggregation;
}

export function buildValueChartData(
  valuePoints: ValueSeriesPoint[],
  aggregatePoints: SeriesPoint[],
  valueAggregation: ValueAggregation
): ValueChartPoint[] {
  if (!isBucketedValueAggregation(valueAggregation)) {
    return valuePoints.map((point: ValueSeriesPoint) => ({
      at: point.at,
      displayValue: point.value,
      eventCount: 1,
      eventId: point.eventId,
      endedAt: point.endedAt,
      textValue: point.textValue,
      note: point.note,
      durationSeconds: point.durationSeconds,
      ongoing: point.ongoing
    }));
  }

  return aggregatePoints
    .filter((point: SeriesPoint) => point.valueSum !== null)
    .map((point: SeriesPoint) => ({
      at: point.bucket,
      displayValue: point.valueSum!,
      eventCount: point.eventCount,
      eventId: null,
      endedAt: null,
      textValue: null,
      note: null,
      durationSeconds: null,
      ongoing: false
    }));
}
