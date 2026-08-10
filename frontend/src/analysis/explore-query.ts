import type { AnalysisQueryRequestV1 } from '../types';
import type { ExploreInput } from './editor/InputEditor';

export function rollingRange(
  durationMs: number = 2 * 24 * 60 * 60 * 1000,
  now: number = Date.now()
): { from: string; to: string } {
  return {
    from: new Date(now - durationMs).toISOString(),
    to: new Date(now).toISOString()
  };
}

export function buildExploreQuery(
  inputs: ExploreInput[],
  range: { from: string; to: string },
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): AnalysisQueryRequestV1 {
  return {
    schemaVersion: 1,
    from: range.from,
    to: range.to,
    timeZone,
    inputs: inputs.map((input) => ({
      alias: input.alias,
      eventTypeKey: input.eventTypeKey,
      ...(input.displayUnitKey
        ? { displayUnitKey: input.displayUnitKey }
        : {}),
      rowsBefore: input.rowsBefore,
      rowsAfter: input.rowsAfter,
      includeOngoing: input.includeOngoing
    }))
  };
}
