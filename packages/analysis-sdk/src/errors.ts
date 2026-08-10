export class AnalysisRuntimeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AnalysisRuntimeError';
  }
}

export function assertFiniteNumber(value: unknown, operation: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AnalysisRuntimeError('invalid_numeric_result', `${operation} must return a finite number or null`);
  }
  return value;
}
