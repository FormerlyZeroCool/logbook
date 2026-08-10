import {
  generateProgramBody,
  parseProgramBody,
  type FunctionBindingTypes,
  type PipelineDefinitionV1,
  type SourceDiagnostic,
} from '@logbook/analysis-sdk';

export type PipelineSession = {
  definition: PipelineDefinitionV1;
  sourceAtOpen: string;
};

export type OpenPipelineResult = {
  session: PipelineSession | null;
  diagnostics: SourceDiagnostic[];
};

/** Derive a temporary visual-pipeline session from the canonical source. */
export function openPipelineSession(
  source: string,
  bindings: FunctionBindingTypes = {},
): OpenPipelineResult {
  const parsed = parseProgramBody(source, bindings);
  return {
    session: parsed.definition
      ? { definition: parsed.definition, sourceAtOpen: source }
      : null,
    diagnostics: parsed.diagnostics,
  };
}

/** Convert a visual edit back into the canonical persisted source. */
export function sourceFromPipelineEdit(definition: PipelineDefinitionV1): string {
  return generateProgramBody(definition);
}
