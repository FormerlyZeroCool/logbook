import type { SerializedScalar, UnitDescriptor } from '../contracts.js';

export class ScalarValue {
  constructor(
    readonly value: number | string | null,
    readonly label: string | null = null,
    readonly unit: UnitDescriptor | null = null,
    readonly description: string | null = null
  ) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Scalar value must be finite');
    Object.freeze(this);
  }
  withLabel(label: string): ScalarValue { return new ScalarValue(this.value, label, this.unit, this.description); }
  withUnit(unit: UnitDescriptor | null): ScalarValue { return new ScalarValue(this.value, this.label, unit, this.description); }
  withDescription(description: string): ScalarValue { return new ScalarValue(this.value, this.label, this.unit, description); }
  toJSON(): SerializedScalar {
    return { kind: 'scalar', value: this.value, label: this.label, unit: this.unit, description: this.description };
  }
}
