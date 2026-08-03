import type { AnalysisFunctionKind, AnalysisLimits, AnalysisQueryResponseV1, SerializedAnalysisResult } from '@logbook/analysis-sdk';
export type AnalysisRunRequest = {
  type: 'run'; requestId: string; sourceBody: string; inputAliases: string[];
  functionBindings: Array<{ alias: string; functionKey?: string; functionKind: AnalysisFunctionKind; sourceBody: string; options: Record<string, unknown> }>;
  queryResponse: AnalysisQueryResponseV1; limits: AnalysisLimits;
};
export type AnalysisCancelRequest = { type: 'cancel'; requestId: string };
export type AnalysisWorkerRequest = AnalysisRunRequest | AnalysisCancelRequest;
export type AnalysisWorkerResponse =
  | { type: 'result'; requestId: string; result: SerializedAnalysisResult; durationMs: number; inputPointCount: number; outputPointCount: number }
  | { type: 'error'; requestId: string; code: 'compile' | 'timeout' | 'runtime' | 'invalid-output' | 'cancelled'; message: string; stack?: string };
