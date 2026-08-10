import { pipelineOperationRegistry } from './pipeline/operation-registry.js';

export const sdkManifest = Object.freeze({
  version: 1,
  constructors: ['EventRecord', 'EventSeries', 'NumericPoint', 'NumericSeries', 'NumericWindow', 'ScalarValue', 'SeriesSet', 'UnitDescriptor', 'AnalysisContext', 'MapFilterResult'],
  operations: pipelineOperationRegistry.map((operation) => ({
    methodName: operation.methodName,
    aliases: operation.aliases ?? [],
    inputType: operation.inputType,
    outputType: operation.outputType,
    label: operation.editor.label,
    description: operation.editor.description,
    category: operation.editor.category,
    compatibleFunctionKinds: operation.compatibleFunctionKinds ?? []
  }))
});
