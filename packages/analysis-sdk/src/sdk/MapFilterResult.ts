export class MapFilterResult {
  private constructor(readonly keep: boolean, readonly value: number | null) {
    Object.freeze(this);
  }
  static keep(value: number | null): MapFilterResult {
    return new MapFilterResult(true, value);
  }
  static drop(): MapFilterResult {
    return new MapFilterResult(false, null);
  }
}
