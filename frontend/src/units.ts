import type { UnitDefinition, UnitTypeDefinition } from './types';

export function findUnitType(unitTypes: UnitTypeDefinition[], key: string | null | undefined): UnitTypeDefinition | null {
  if (!key) return null;
  return unitTypes.find((unitType: UnitTypeDefinition) => unitType.key === key) ?? null;
}

export function findUnit(unitType: UnitTypeDefinition | null, key: string | null | undefined): UnitDefinition | null {
  if (!unitType || !key) return null;
  return unitType.units.find((unit: UnitDefinition) => unit.key === key) ?? null;
}

export function formatMeasuredValue(value: number, unit: UnitDefinition): string {
  const abs = Math.abs(value);
  const maximumFractionDigits = abs >= 100 ? 1 : abs >= 10 ? 2 : 3;
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value)} ${unit.symbol}`;
}
