export type ConversionUnit = {
  id: string;
  key: string;
  unitTypeId: string;
  scaleToBase: number;
  offsetToBase: number;
};

export class UnitConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new UnitConversionError(`${label} must be finite`);
}

export function validateConversion(unit: Pick<ConversionUnit, 'scaleToBase' | 'offsetToBase'>): void {
  requireFinite(unit.scaleToBase, 'scaleToBase');
  requireFinite(unit.offsetToBase, 'offsetToBase');
  if (unit.scaleToBase <= 0) throw new UnitConversionError('scaleToBase must be greater than zero');
}

export function toBase(value: number, unit: Pick<ConversionUnit, 'scaleToBase' | 'offsetToBase'>): number {
  requireFinite(value, 'value');
  validateConversion(unit);
  const converted = (value * unit.scaleToBase) + unit.offsetToBase;
  requireFinite(converted, 'converted value');
  return converted;
}

export function fromBase(value: number, unit: Pick<ConversionUnit, 'scaleToBase' | 'offsetToBase'>): number {
  requireFinite(value, 'value');
  validateConversion(unit);
  const converted = (value - unit.offsetToBase) / unit.scaleToBase;
  requireFinite(converted, 'converted value');
  return converted;
}
