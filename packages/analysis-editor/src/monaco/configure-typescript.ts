import type { Monaco } from '@monaco-editor/react';
import { ANALYSIS_SDK_DECLARATIONS } from '@logbook/analysis-sdk';

const configuredApis = new WeakSet<object>();

export function configureAnalysisTypeScript(monacoApi: Monaco): void {
  if (configuredApis.has(monacoApi)) return;
  configuredApis.add(monacoApi);

  const defaults = monacoApi.languages.typescript.typescriptDefaults;
  defaults.setCompilerOptions({
    target: monacoApi.languages.typescript.ScriptTarget.ESNext,
    module: monacoApi.languages.typescript.ModuleKind.ESNext,
    lib: ['es2023'],
    allowNonTsExtensions: true,
    strict: true,
    noImplicitAny: true,
    noImplicitReturns: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    useUnknownInCatchVariables: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    noEmit: true,
    types: [],
  });
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
    onlyVisible: false,
  });
  defaults.setEagerModelSync(true);
  defaults.addExtraLib(ANALYSIS_SDK_DECLARATIONS, 'file:///logbook-analysis-sdk.d.ts');
}
