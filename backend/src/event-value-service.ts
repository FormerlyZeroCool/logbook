import { toBase } from './unit-conversion.js';

export type EventMeasurementConfig = {
  eventTypeKey: string;
  unitTypeId: string | null;
  unitTypeKey: string | null;
  defaultUnitKey: string | null;
};

export type ResolvedInputUnit = {
  id: string;
  key: string;
  unitTypeId: string;
  scaleToBase: number;
  offsetToBase: number;
};

export type NormalizedEventValue = {
  inputValue: number | null;
  inputUnitId: string | null;
  canonicalValue: number | null;
};

export class EventValueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventValueValidationError';
  }
}

export async function normalizeEventValue(
  config: EventMeasurementConfig,
  value: number | null | undefined,
  requestedUnitKey: string | null | undefined,
  resolveUnit: (unitTypeId: string, unitKey: string) => Promise<ResolvedInputUnit | null>
): Promise<NormalizedEventValue> {
  if (value === undefined || value === null) {
    if (requestedUnitKey != null) throw new EventValueValidationError('unitKey requires a numeric value');
    return { inputValue: null, inputUnitId: null, canonicalValue: null };
  }

  if (!config.unitTypeId) {
    if (requestedUnitKey != null) {
      throw new EventValueValidationError(
        `Event type ${config.eventTypeKey} is unitless and cannot accept unit ${requestedUnitKey}`
      );
    }
    return { inputValue: value, inputUnitId: null, canonicalValue: value };
  }

  const selectedKey = requestedUnitKey ?? config.defaultUnitKey;
  if (!selectedKey) {
    throw new EventValueValidationError(`Event type ${config.eventTypeKey} has no default unit`);
  }

  const unit = await resolveUnit(config.unitTypeId, selectedKey);
  if (!unit || unit.unitTypeId !== config.unitTypeId) {
    throw new EventValueValidationError(`Unit ${selectedKey} is not valid for ${config.unitTypeKey}`);
  }

  return {
    inputValue: value,
    inputUnitId: unit.id,
    canonicalValue: toBase(value, unit)
  };
}
