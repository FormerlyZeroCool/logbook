import { Worker } from 'node:worker_threads';
import {
  ANALYSIS_SDK_VERSION,
  PIPELINE_REGISTRY_VERSION,
  compileAnalysisProgram,
  validateProgramSource,
  type AnalysisFunctionKind,
  type AnalysisLimits,
  type AnalysisValidationReport,
  type SourceDiagnostic
} from '@logbook/analysis-sdk';
import { analysisSourceHash } from './source-hash.js';

export type ValidationRequest = {
  sourceBody: string;
  inputAliases: string[];
  functionBindings: Array<{
    alias: string;
    functionKey?: string;
    functionKind: AnalysisFunctionKind;
    sourceBody: string;
    options?: Record<string, unknown>;
  }>;
};

type WorkerValidationResult = {
  failed: boolean;
  fixtures: AnalysisValidationReport['fixtures'];
};

type ResolveWorkerValidation = (
  value: WorkerValidationResult | PromiseLike<WorkerValidationResult>
) => void;
type RejectWorkerValidation = (reason?: unknown) => void;

export async function validateAnalysisProgram(
  request: ValidationRequest,
  limits: AnalysisLimits
): Promise<AnalysisValidationReport> {
  const sourceHash = analysisSourceHash({
    sourceBody: request.sourceBody,
    inputAliases: request.inputAliases,
    functionBindings: request.functionBindings
  });
  const sourceDiagnostics = validateProgramSource(
    request.sourceBody,
    request.inputAliases
  );
  const compilation = compileAnalysisProgram({
    sourceBody: request.sourceBody,
    inputAliases: request.inputAliases,
    functionBindings: request.functionBindings,
    semantic: true
  });
  const syntaxDiagnostics = [
    ...sourceDiagnostics,
    ...compilation.diagnostics
  ];
  if (
    !compilation.javascript ||
    syntaxDiagnostics.some(
      (diagnostic: SourceDiagnostic) => diagnostic.severity === 'error'
    )
  ) {
    return {
      schemaVersion: 1,
      sourceHash,
      sdkVersion: ANALYSIS_SDK_VERSION,
      pipelineRegistryVersion: PIPELINE_REGISTRY_VERSION,
      timeoutMs: limits.timeoutMs,
      status: 'syntax-error',
      syntaxDiagnostics,
      fixtures: [],
      validatedAt: new Date().toISOString()
    };
  }

  const worker = new Worker(new URL('./validation-worker.js', import.meta.url));
  const watchdogMs = limits.timeoutMs * 2 * 10 + 2_000;
  try {
    const result = await new Promise<WorkerValidationResult>((
      resolve: ResolveWorkerValidation,
      reject: RejectWorkerValidation
    ): void => {
      const timer = setTimeout((): void => {
        void worker.terminate();
        reject(new Error('Authoritative validation worker timed out'));
      }, watchdogMs);
      worker.once('message', (message: unknown): void => {
        clearTimeout(timer);
        resolve(message as WorkerValidationResult);
      });
      worker.once('error', (error: Error): void => {
        clearTimeout(timer);
        reject(error);
      });
      worker.postMessage({
        compiledJavaScript: compilation.javascript,
        inputAliases: request.inputAliases,
        limits
      });
    });
    return {
      schemaVersion: 1,
      sourceHash,
      sdkVersion: ANALYSIS_SDK_VERSION,
      pipelineRegistryVersion: PIPELINE_REGISTRY_VERSION,
      timeoutMs: limits.timeoutMs,
      status: result.failed ? 'failed' : 'passed',
      syntaxDiagnostics,
      fixtures: result.fixtures,
      validatedAt: new Date().toISOString()
    };
  } finally {
    await worker.terminate();
  }
}
