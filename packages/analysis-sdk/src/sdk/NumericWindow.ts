import { NumericPoint } from './NumericPoint.js';

export class NumericWindow {
  readonly values: readonly (number | null)[];
  readonly points: readonly NumericPoint[];
  readonly anchorPoint: NumericPoint;
  readonly anchorIndex: number;
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly requestedSize: number;
  readonly actualSize: number;
  readonly complete: boolean;

  constructor(input: {
    points: NumericPoint[];
    anchorPoint: NumericPoint;
    anchorIndex: number;
    startIndex: number;
    endIndexExclusive: number;
    requestedSize: number;
  }) {
    this.points = Object.freeze([...input.points]);
    this.values = Object.freeze(input.points.map((point) => point.value));
    this.anchorPoint = input.anchorPoint;
    this.anchorIndex = input.anchorIndex;
    this.startIndex = input.startIndex;
    this.endIndexExclusive = input.endIndexExclusive;
    this.requestedSize = input.requestedSize;
    this.actualSize = input.points.length;
    this.complete = input.points.length === input.requestedSize;
    Object.freeze(this);
  }

  validValues(): readonly number[] {
    return this.values.filter((value): value is number => value !== null && Number.isFinite(value));
  }
  first(): NumericPoint | null { return this.points[0] ?? null; }
  latest(): NumericPoint | null { return this.points[this.points.length - 1] ?? null; }
}
