import type { SerializedSeriesSet } from '../contracts.js';
import { NumericSeries } from './NumericSeries.js';

export class SeriesSet {
  readonly series: readonly NumericSeries[];
  constructor(series: NumericSeries[], readonly title: string | null = null) {
    this.series = Object.freeze([...series]);
    Object.freeze(this);
  }
  static of(...series: NumericSeries[]): SeriesSet { return new SeriesSet(series); }
  withTitle(title: string): SeriesSet { return new SeriesSet([...this.series], title); }
  toJSON(): SerializedSeriesSet {
    return { kind: 'series-set', title: this.title, series: this.series.map((series) => series.toJSON()) };
  }
}
