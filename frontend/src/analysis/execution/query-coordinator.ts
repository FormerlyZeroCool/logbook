import { api } from '../../api';
import type { AnalysisCapabilities, AnalysisQueryRequestV1 } from '../../types';
import { getAnalysisWorkerPool, toRuntimeLimits } from './analysis-execution-manager';
export async function executeAnalysis(input: { panelKey: string; sourceBody: string; query: AnalysisQueryRequestV1; capabilities: AnalysisCapabilities; functionBindings?: Array<{ alias: string; functionKind: import('../../types').AnalysisFunctionKind; sourceBody: string; options: Record<string, unknown> }> }) {
  const queryResponse = await api.queryAnalysis(input.query);
  const requestId = crypto.randomUUID();
  return getAnalysisWorkerPool(input.capabilities).run(input.panelKey, { type: 'run', requestId, sourceBody: input.sourceBody, inputAliases: input.query.inputs.map((item) => item.alias), functionBindings: input.functionBindings ?? [], queryResponse, limits: toRuntimeLimits(input.capabilities) });
}
