import { describe, expect, it } from 'vitest';
import { EventValueValidationError, normalizeEventValue, type ResolvedInputUnit } from './event-value-service.js';

const units: Record<string, ResolvedInputUnit> = {
  kwh: { id: '1', key: 'kwh', unitTypeId: 'energy', scaleToBase: 1000, offsetToBase: 0 },
  wh: { id: '2', key: 'wh', unitTypeId: 'energy', scaleToBase: 1, offsetToBase: 0 },
  kw: { id: '3', key: 'kw', unitTypeId: 'power', scaleToBase: 1000, offsetToBase: 0 }
};
const resolve = async (_typeId: string, key: string) => units[key] ?? null;

describe('event value normalization service', () => {
  it('uses the configured default unit and stores Wh', async () => {
    const result = await normalizeEventValue({
      eventTypeKey: 'energy_use', unitTypeId: 'energy', unitTypeKey: 'energy', defaultUnitKey: 'kwh'
    }, 2.5, undefined, resolve);
    expect(result).toEqual({ inputValue: 2.5, inputUnitId: '1', canonicalValue: 2500 });
  });

  it('accepts an explicit compatible unit', async () => {
    const result = await normalizeEventValue({
      eventTypeKey: 'energy_use', unitTypeId: 'energy', unitTypeKey: 'energy', defaultUnitKey: 'kwh'
    }, 125, 'wh', resolve);
    expect(result.canonicalValue).toBe(125);
  });

  it('rejects a unit from the wrong unit type', async () => {
    await expect(normalizeEventValue({
      eventTypeKey: 'energy_use', unitTypeId: 'energy', unitTypeKey: 'energy', defaultUnitKey: 'kwh'
    }, 2, 'kw', resolve)).rejects.toBeInstanceOf(EventValueValidationError);
  });

  it('rejects units on unitless event types', async () => {
    await expect(normalizeEventValue({
      eventTypeKey: 'medication', unitTypeId: null, unitTypeKey: null, defaultUnitKey: null
    }, 1, 'count', resolve)).rejects.toThrow('unitless');
  });
});
