import type { SerializedNumericPoint } from '../contracts.js';

type NumericPointInput = SerializedNumericPoint & { calendarBucketStarts?: { day: string; week: string } | null };

export class NumericPoint {
  readonly time: string;
  readonly timeMs: number;
  readonly value: number | null;
  readonly eventId: string | null;
  readonly note: string | null;
  readonly textValue: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly inRequestedRange: boolean;
  readonly calendarBucketStarts: { day: string; week: string } | null;

  constructor(input: NumericPointInput) {
    this.time = input.time;
    this.timeMs = input.timeMs;
    this.value = input.value;
    this.eventId = input.eventId;
    this.note = input.note;
    this.textValue = input.textValue;
    this.startedAt = input.startedAt;
    this.endedAt = input.endedAt;
    this.inRequestedRange = input.inRequestedRange;
    this.calendarBucketStarts = input.calendarBucketStarts ?? null;
    Object.freeze(this);
  }

  withValue(value: number | null): NumericPoint {
    return new NumericPoint({ ...this.toJSON(), calendarBucketStarts: this.calendarBucketStarts, value });
  }

  toJSON(): SerializedNumericPoint {
    return {
      time: this.time,
      timeMs: this.timeMs,
      value: this.value,
      eventId: this.eventId,
      note: this.note,
      textValue: this.textValue,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      inRequestedRange: this.inRequestedRange
    };
  }
}
