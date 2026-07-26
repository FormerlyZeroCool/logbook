import type { AnalysisQueryResponseV1 } from '../contracts.js';

const baseTime = Date.parse('2026-01-01T00:00:00.000Z');
function event(index: number, value: number | null, options: { ongoing?: boolean; visible?: boolean; sameTime?: boolean } = {}) {
  const startedAtMs = baseTime + (options.sameTime ? 0 : index * 73_000);
  const ongoing = options.ongoing ?? false;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: ongoing ? null : new Date(startedAtMs + 60_000).toISOString(),
    displayValue: value,
    textValue: null,
    note: index % 3 === 0 ? `fixture ${index}` : null,
    ongoing,
    inRequestedRange: options.visible ?? true
  };
}
function response(events: ReturnType<typeof event>[]): AnalysisQueryResponseV1 {
  return {
    schemaVersion: 1,
    context: { from: new Date(baseTime).toISOString(), to: new Date(baseTime + 14 * 86_400_000).toISOString(), now: new Date(baseTime + 15 * 86_400_000).toISOString(), timeZone: 'UTC' },
    inputs: { event: { key: 'fixture', label: 'Fixture', unit: { key: 'count', symbol: '#', dimensionKey: 'quantity' }, events } }
  };
}

export const mandatoryAnalysisFixtures = Object.freeze([
  { key: 'empty', response: response([]) },
  { key: 'large-10000', response: response(Array.from({ length: 10_000 }, (_, index) => event(index, index % 17 === 0 ? null : index % 101))) },
  { key: 'zero-values', response: response([0, 1, 0, -1, 2, 0].map((value, index) => event(index, value))) },
  { key: 'single-point', response: response([event(0, 1)]) },
  { key: 'null-containing', response: response([event(0, null), event(1, 2), event(2, null)]) },
  { key: 'out-of-order', response: response([event(2, 3), event(0, 1), event(1, 2)]) },
  { key: 'identical-timestamps', response: response([event(0, 1, { sameTime: true }), event(1, 2, { sameTime: true })]) },
  { key: 'ongoing', response: response([event(0, 4, { ongoing: true })]) },
  { key: 'negative-values', response: response([event(0, -10), event(1, 0), event(2, 10)]) },
  { key: 'mixed-context', response: response([event(0, 1, { visible: false }), event(1, 2), event(2, 3), event(3, 4, { visible: false })]) }
]);
