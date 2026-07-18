import { describe, expect, it } from 'vitest';
import {
  assertEventTimeShape,
  assertTimeOrder,
  durationEventStartSchema,
  eventEndSchema,
  eventTypeCreateSchema,
  eventTypeKeySchema,
  eventUpdateSchema,
  latestEventUpdateSchema,
  pointEventLogSchema,
  seriesQuerySchema,
  unitCreateSchema,
  unitKeySchema,
  unitTypeCreateSchema,
  unitTypeKeySchema,
  voiceAliasesSchema
} from './validation.js';

describe('validation', () => {
  it('accepts useful event type keys', () => {
    expect(eventTypeKeySchema.parse('dog_walk')).toBe('dog_walk');
  });

  it('rejects unsafe event type keys', () => {
    expect(() => eventTypeKeySchema.parse('Dog Walk')).toThrow();
  });

  it('creates event types without an event mode', () => {
    const parsed = eventTypeCreateSchema.parse({ key: 'water', name: 'Water' });
    expect(parsed.key).toBe('water');
    expect('eventMode' in parsed).toBe(false);
  });

  it('accepts energy and power catalog keys', () => {
    expect(unitTypeKeySchema.parse('energy')).toBe('energy');
    expect(unitTypeKeySchema.parse('power')).toBe('power');
    expect(unitKeySchema.parse('kwh')).toBe('kwh');
    expect(unitKeySchema.parse('kw')).toBe('kw');
    expect(unitKeySchema.parse('tsp_us')).toBe('tsp_us');
    expect(unitKeySchema.parse('tbsp_us')).toBe('tbsp_us');
  });

  it('requires a canonical base unit for new unit types', () => {
    expect(unitTypeCreateSchema.parse({
      key: 'distance',
      name: 'Distance',
      baseUnit: { key: 'm', name: 'Meter', symbol: 'm' }
    }).baseUnit.key).toBe('m');
    expect(() => unitTypeCreateSchema.parse({ key: 'distance', name: 'Distance' })).toThrow();
  });

  it('requires an explicit positive conversion for new non-base units', () => {
    expect(unitCreateSchema.parse({
      key: 'km', name: 'Kilometer', symbol: 'km', scaleToBase: 1000
    }).scaleToBase).toBe(1000);
    expect(() => unitCreateSchema.parse({ key: 'km', name: 'Kilometer', symbol: 'km' })).toThrow();
    expect(() => unitCreateSchema.parse({ key: 'km', name: 'Kilometer', symbol: 'km', scaleToBase: 0 })).toThrow();
  });



  it('normalizes and deduplicates event type voice aliases', () => {
    expect(voiceAliasesSchema.parse(['feed Jay', 'feed Jay', 'Jay feeding']))
      .toEqual(['feed Jay', 'Jay feeding']);
    expect(eventTypeCreateSchema.parse({
      key: 'feeding_jay',
      name: 'Feeding Jay',
      voiceAliases: ['feed Jay']
    }).voiceAliases).toEqual(['feed Jay']);
  });

  it('requires a unit type when an event type specifies a default unit', () => {
    expect(() => eventTypeCreateSchema.parse({
      key: 'water',
      name: 'Water',
      defaultUnitKey: 'ml'
    })).toThrow();
    expect(eventTypeCreateSchema.parse({
      key: 'water',
      name: 'Water',
      unitTypeKey: 'volume',
      defaultUnitKey: 'fl_oz_us'
    }).defaultUnitKey).toBe('fl_oz_us');
  });

  it('allows a numeric value with a unit but rejects a unit without a value', () => {
    expect(pointEventLogSchema.parse({
      eventTypeKey: 'water',
      value: 12,
      unitKey: 'fl_oz_us'
    }).unitKey).toBe('fl_oz_us');
    expect(() => pointEventLogSchema.parse({
      eventTypeKey: 'water',
      unitKey: 'ml'
    })).toThrow();
  });

  it('validates updates to the latest event start time, value, and note', () => {
    expect(latestEventUpdateSchema.parse({
      startedAt: '2026-07-15T11:45:00.000Z'
    }).startedAt).toBe('2026-07-15T11:45:00.000Z');
    expect(latestEventUpdateSchema.parse({ note: 'Corrected note' }).note).toBe('Corrected note');
    expect(latestEventUpdateSchema.parse({ value: 3, unitKey: 'tbsp_us' }).unitKey).toBe('tbsp_us');
    expect(() => latestEventUpdateSchema.parse({})).toThrow();
    expect(() => latestEventUpdateSchema.parse({ unitKey: 'ml' })).toThrow();
  });

  it('accepts dedicated log and start requests', () => {
    expect(pointEventLogSchema.parse({ eventTypeKey: 'water', value: 12 }).eventTypeKey).toBe('water');
    expect(durationEventStartSchema.parse({ eventTypeKey: 'dog_walk' }).eventTypeKey).toBe('dog_walk');
  });

  it('requires an event catalog reference for log and start', () => {
    expect(() => pointEventLogSchema.parse({ value: 2 })).toThrow();
    expect(() => durationEventStartSchema.parse({ value: 2 })).toThrow();
  });

  it('rejects ambiguous event type references', () => {
    expect(() => pointEventLogSchema.parse({
      eventTypeId: '7d4685bb-9e66-45f7-882a-25a497e2b70e',
      eventTypeKey: 'dog_walk'
    })).toThrow();
    expect(() => eventUpdateSchema.parse({
      eventTypeId: '7d4685bb-9e66-45f7-882a-25a497e2b70e',
      eventTypeKey: 'dog_walk'
    })).toThrow();
  });

  it('ends by either event id or event type, never both', () => {
    expect(eventEndSchema.parse({ eventId: '7d4685bb-9e66-45f7-882a-25a497e2b70e' }).eventId).toBeTruthy();
    expect(eventEndSchema.parse({ eventTypeKey: 'dog_walk' }).eventTypeKey).toBe('dog_walk');
    expect(eventEndSchema.parse({ eventTypeKey: 'feeding', value: 8, unitKey: 'fl_oz_us' })).toMatchObject({
      eventTypeKey: 'feeding',
      value: 8,
      unitKey: 'fl_oz_us'
    });
    expect(() => eventEndSchema.parse({ eventTypeKey: 'feeding', unitKey: 'fl_oz_us' })).toThrow();
    expect(() => eventEndSchema.parse({})).toThrow();
    expect(() => eventEndSchema.parse({
      eventId: '7d4685bb-9e66-45f7-882a-25a497e2b70e',
      eventTypeKey: 'dog_walk'
    })).toThrow();
  });

  it('rejects a backward duration', () => {
    expect(() => assertTimeOrder('2026-07-15T12:00:00Z', '2026-07-15T11:00:00Z')).toThrow();
  });

  it('requires point events to have identical start and end times', () => {
    expect(() => assertEventTimeShape('point', '2026-07-15T12:00:00Z', null)).toThrow();
    expect(() => assertEventTimeShape('point', '2026-07-15T12:00:00Z', '2026-07-15T12:00:01Z')).toThrow();
    expect(() => assertEventTimeShape('point', '2026-07-15T12:00:00Z', '2026-07-15T12:00:00Z')).not.toThrow();
  });

  it('allows ongoing and completed duration events', () => {
    expect(() => assertEventTimeShape('duration', '2026-07-15T12:00:00Z', null)).not.toThrow();
    expect(() => assertEventTimeShape('duration', '2026-07-15T12:00:00Z', '2026-07-15T12:30:00Z')).not.toThrow();
  });

  it('whitelists SQL interval-like buckets and validates time zones', () => {
    expect(seriesQuerySchema.parse({ bucket: '15 minutes' })).toMatchObject({
      bucket: '15 minutes',
      timeZone: 'UTC'
    });
    expect(seriesQuerySchema.parse({ bucket: '1 day', timeZone: 'America/New_York' }).timeZone)
      .toBe('America/New_York');
    expect(() => seriesQuerySchema.parse({ bucket: "1 hour'); DROP TABLE events; --" })).toThrow();
    expect(() => seriesQuerySchema.parse({ bucket: '1 day', timeZone: 'Not/A_Time_Zone' })).toThrow();
  });
});
