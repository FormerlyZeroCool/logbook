import type { AnalysisCapabilities } from '../../types';
import type { AnalysisRunRequest } from '../worker/protocol';
import { AnalysisWorkerPool } from '../worker/worker-pool';
let pool: AnalysisWorkerPool | null = null;
let configuredSize = 0;
export function getAnalysisWorkerPool(capabilities: AnalysisCapabilities): AnalysisWorkerPool {
  if (!pool || configuredSize !== capabilities.workerPoolSize) { pool?.dispose(); configuredSize = capabilities.workerPoolSize; pool = new AnalysisWorkerPool(configuredSize); }
  return pool;
}
export function toRuntimeLimits(capabilities: AnalysisCapabilities): AnalysisRunRequest['limits'] {
  return { timeoutMs: capabilities.executionTimeoutMs, memoryBytes: capabilities.memoryLimitBytes, stackBytes: capabilities.stackLimitBytes, maxInputEvents: capabilities.maxInputEvents, maxOutputPoints: capabilities.maxOutputPoints, maxOutputSeries: capabilities.maxOutputSeries, maxLogs: capabilities.maxConsoleEntries, maxSerializedBytes: capabilities.maxSerializedResultBytes, workerPoolSize: capabilities.workerPoolSize };
}
