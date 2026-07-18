import { describe, expect, it } from 'vitest';
import { fromBase, toBase, UnitConversionError, validateConversion } from './unit-conversion.js';

describe('unit conversion', () => {
  it('normalizes mass, volume, energy, and power into their base units', () => {
    expect(toBase(2, { scaleToBase: 453.59237, offsetToBase: 0 })).toBeCloseTo(907.18474, 8);
    expect(toBase(1.5, { scaleToBase: 1000, offsetToBase: 0 })).toBe(1500);
    expect(toBase(2.4, { scaleToBase: 1000, offsetToBase: 0 })).toBe(2400); // kWh -> Wh
    expect(toBase(1.25, { scaleToBase: 1000, offsetToBase: 0 })).toBe(1250); // kW -> W
  });

  it('converts US teaspoons and tablespoons to canonical milliliters', () => {
    const teaspoon = { scaleToBase: 4.92892159375, offsetToBase: 0 };
    const tablespoon = { scaleToBase: 14.78676478125, offsetToBase: 0 };

    expect(toBase(1, teaspoon)).toBeCloseTo(4.92892159375, 12);
    expect(toBase(1, tablespoon)).toBeCloseTo(14.78676478125, 12);
    expect(toBase(3, teaspoon)).toBeCloseTo(toBase(1, tablespoon), 12);
    expect(fromBase(29.5735295625, teaspoon)).toBeCloseTo(6, 12);
    expect(fromBase(29.5735295625, tablespoon)).toBeCloseTo(2, 12);
  });

  it('supports affine conversions in the backend', () => {
    expect(toBase(32, { scaleToBase: 5 / 9, offsetToBase: -17.77777777777778 })).toBeCloseTo(0, 10);
    expect(fromBase(100, { scaleToBase: 5 / 9, offsetToBase: -17.77777777777778 })).toBeCloseTo(212, 10);
  });

  it('round trips values', () => {
    const unit = { scaleToBase: 29.5735295625, offsetToBase: 0 };
    expect(fromBase(toBase(12, unit), unit)).toBeCloseTo(12, 12);
  });

  it('rejects invalid conversion definitions and non-finite results', () => {
    expect(() => validateConversion({ scaleToBase: 0, offsetToBase: 0 })).toThrow(UnitConversionError);
    expect(() => validateConversion({ scaleToBase: Number.NaN, offsetToBase: 0 })).toThrow(UnitConversionError);
    expect(() => toBase(Number.POSITIVE_INFINITY, { scaleToBase: 1, offsetToBase: 0 })).toThrow(UnitConversionError);
  });
});
