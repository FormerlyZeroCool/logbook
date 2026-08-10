import type { AnalysisEventDto, UnitDescriptor } from '../contracts.js';

export class EventRecord {
  readonly id: string;
  readonly startedAt: string;
  readonly startedAtMs: number;
  readonly endedAt: string | null;
  readonly endedAtMs: number | null;
  readonly value: number | null;
  readonly textValue: string | null;
  readonly note: string | null;
  readonly ongoing: boolean;
  readonly durationMs: number | null;
  readonly unit: UnitDescriptor | null;
  readonly inRequestedRange: boolean;
  readonly calendarBucketStarts: { day: string; week: string } | null;

  constructor(input: AnalysisEventDto, unit: UnitDescriptor | null, nowMs: number) {
    const startedAtMs = Date.parse(input.startedAt);
    const endedAtMs = input.endedAt === null ? null : Date.parse(input.endedAt);
    this.id = input.id;
    this.startedAt = input.startedAt;
    this.startedAtMs = startedAtMs;
    this.endedAt = input.endedAt;
    this.endedAtMs = endedAtMs;
    this.value = input.displayValue;
    this.textValue = input.textValue;
    this.note = input.note;
    this.ongoing = input.ongoing;
    this.durationMs = Math.max(0, (endedAtMs ?? nowMs) - startedAtMs);
    this.unit = unit;
    this.inRequestedRange = input.inRequestedRange;
    this.calendarBucketStarts = input.calendarBucketStarts ?? null;
    Object.freeze(this);
  }
}
