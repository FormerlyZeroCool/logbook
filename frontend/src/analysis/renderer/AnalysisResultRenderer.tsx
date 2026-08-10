import type { SerializedAnalysisResult } from '@logbook/analysis-sdk';
import { ScalarResult } from './ScalarResult';
import { SeriesResult } from './SeriesResult';
import { SeriesSetResult } from './SeriesSetResult';

export function AnalysisResultRenderer({ result }: { result: SerializedAnalysisResult | null }) {
  if (!result) return <div className="analysis-empty">Run the program to see output.</div>;
  if (result.kind === 'scalar') return <ScalarResult result={result} />;
  if (result.kind === 'series') return <SeriesResult result={result} />;
  return <SeriesSetResult result={result} />;
}
