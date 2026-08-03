import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analysisFunctionCollection,
  analysisFunctionIdentifier,
  analysisFunctionPropertyIdentifier,
  generateProgramBody,
  type AnalysisFunctionKind,
  type AnalysisValidationReport,
  type PipelineDefinitionV1,
  type SerializedAnalysisResult,
  type SourceDiagnostic,
  typeCheckPipeline,
} from '@logbook/analysis-sdk';
import { AnalysisProgramEditor } from '@logbook/analysis-editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { FunctionBindingEditor } from '../analysis/editor/FunctionBindingEditor';
import { InputEditor, type ExploreInput } from '../analysis/editor/InputEditor';
import { PipelineEditor } from '../analysis/editor/PipelineEditor';
import { openPipelineSession, sourceFromPipelineEdit } from '../analysis/editor/pipeline-code-sync';
import { SdkReferenceDrawer } from '../analysis/editor/SdkReferenceDrawer';
import { SessionFunctionWorkbench, createSessionFunction } from '../analysis/editor/SessionFunctionWorkbench';
import { executeAnalysis } from '../analysis/execution/query-coordinator';
import { buildExploreQuery, rollingRange } from '../analysis/explore-query';
import { AnalysisResultRenderer } from '../analysis/renderer/AnalysisResultRenderer';
import {
  isExploreEditorPreferences,
  type ExploreEditorPreferencesV1,
  type ExploreSessionOrigin,
  type ExploreWorkspaceStateV1,
  type SessionFunctionDraft,
} from '../analysis/session-types';
import { ValidationReport } from '../analysis/validation/ValidationReport';
import type { AnalysisFunctionSummary, AnalysisProgramSummary } from '../types';

type ResolvedBinding = {
  key: string;
  alias: string;
  functionKind: AnalysisFunctionKind;
  sourceBody: string;
  options: Record<string, unknown>;
  functionRevisionId?: string;
};

type ExplorationDetail = {
  id: string;
  program_id: string;
  auto_run: boolean;
  editor_preferences: unknown;
};

type ProgramDetail = {
  id?: string;
  name?: string;
  description?: string | null;
  editor_mode?: 'pipeline' | 'code';
  revisions?: Array<Record<string, unknown>>;
};

function defaultPipeline(alias: string = 'event'): PipelineDefinitionV1 {
  return {
    schemaVersion: 1,
    inputAlias: alias,
    steps: [{ operation: 'values' }],
    outputType: 'NumericSeries',
    queryContext: { mode: 'derived', rowsBefore: 0, rowsAfter: 0, exact: true },
  };
}

function defaultCode(alias: string = 'event'): string {
  return generateProgramBody(defaultPipeline(alias));
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function bodyReferences(sourceBody: string, functionKey: string, functionKind: AnalysisFunctionKind): boolean {
  const alias = analysisFunctionIdentifier(functionKey);
  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedAlias = escapeRegExp(alias);
  const collection = escapeRegExp(analysisFunctionCollection(functionKind));
  const property = escapeRegExp(analysisFunctionPropertyIdentifier(functionKey));
  return new RegExp(`\\b${escapedAlias}\\b`).test(sourceBody)
    || new RegExp(`\\budf\\s*\\.\\s*${collection}\\s*\\.\\s*${property}\\b`).test(sourceBody);
}



function preferredSavedRevisionId(item: AnalysisFunctionSummary): string | null {
  return item.published_revision_id ?? item.draft_revision_id;
}

function toSessionSummary(draft: SessionFunctionDraft): AnalysisFunctionSummary {
  return {
    id: `session:${draft.id}`,
    function_key: draft.functionKey,
    name: draft.name,
    description: draft.description || null,
    function_kind: draft.functionKind,
    is_system: false,
    is_session: true,
    draft_revision_id: null,
    published_revision_id: draft.libraryRevisionId ?? `session:${draft.id}`,
    draft_validation_status: draft.diagnostics.some((item) => item.severity === 'error') ? 'syntax-error' : 'pending',
    ...(draft.libraryPublished ? { published_validation_status: 'passed' } : {}),
  };
}

export function ExplorePage() {
  const { explorationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const eventTypes = useQuery({ queryKey: ['event-types', 'analysis'], queryFn: () => api.listEventTypes(0, false) });
  const capabilities = useQuery({ queryKey: ['capabilities'], queryFn: api.getCapabilities, refetchInterval: false });
  const functions = useQuery({ queryKey: ['analysis-functions'], queryFn: api.listAnalysisFunctions });
  const programs = useQuery({ queryKey: ['analysis-programs'], queryFn: api.listAnalysisPrograms });
  const exploration = useQuery({
    queryKey: ['exploration', explorationId],
    queryFn: () => api.getExploration(explorationId!),
    enabled: Boolean(explorationId),
    refetchInterval: false,
  });

  const explorationDetail = exploration.data as ExplorationDetail | undefined;
  const preferences = isExploreEditorPreferences(explorationDetail?.editor_preferences)
    ? explorationDetail.editor_preferences
    : null;
  const loadedProgram = useQuery({
    queryKey: ['analysis-program', explorationDetail?.program_id],
    queryFn: () => api.getAnalysisProgram(explorationDetail!.program_id),
    enabled: Boolean(explorationDetail?.program_id) && !preferences?.workspace,
    refetchInterval: false,
  });

  const [origin, setOrigin] = useState<ExploreSessionOrigin>({ kind: 'standalone' });
  const [name, setName] = useState('New exploration');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<'pipeline' | 'code'>('pipeline');
  const [programId, setProgramId] = useState<string | null>(null);
  const [lastRevisionId, setLastRevisionId] = useState<string | null>(null);
  const [autoRun, setAutoRun] = useState(true);
  const [rangeMode, setRangeMode] = useState<'rolling' | 'fixed'>('rolling');
  const [fixedRange, setFixedRange] = useState(rollingRange());
  const [inputs, setInputs] = useState<ExploreInput[]>([
    { alias: 'event', eventTypeKey: '', rowsBefore: 0, rowsAfter: 0, contextIsExplicit: false, includeOngoing: true },
  ]);
  const [pipeline, setPipeline] = useState<PipelineDefinitionV1>(defaultPipeline());
  const [code, setCode] = useState(defaultCode());
  const [localFunctions, setLocalFunctions] = useState<SessionFunctionDraft[]>([]);
  const [selectedLocalFunctionId, setSelectedLocalFunctionId] = useState<string | null>(null);
  const [result, setResult] = useState<SerializedAnalysisResult | null>(null);
  const [report, setReport] = useState<AnalysisValidationReport | null>(null);
  const [editorDiagnostics, setEditorDiagnostics] = useState<SourceDiagnostic[]>([]);
  const [runDiagnostics, setRunDiagnostics] = useState<{ runtimeMs: number; input: number; output: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingFunctionId, setSavingFunctionId] = useState<string | null>(null);

  useEffect(() => {
    if (inputs[0]?.eventTypeKey || !eventTypes.data?.[0]) return;
    setInputs((current) => current.length ? [{ ...current[0]!, eventTypeKey: eventTypes.data![0]!.key }, ...current.slice(1)] : current);
  }, [eventTypes.data, inputs]);

  useEffect(() => {
    if (!explorationDetail) return;
    setProgramId(explorationDetail.program_id);
    setAutoRun(explorationDetail.auto_run);
    if (!preferences) return;
    setOrigin(preferences.origin);
    const workspace = preferences.workspace;
    if (!workspace) return;
    setName(workspace.name);
    setDescription(workspace.description);
    setAutoRun(workspace.autoRun);
    setRangeMode(workspace.rangeMode);
    setFixedRange(workspace.fixedRange);
    setInputs(workspace.inputs);
    setCode(workspace.code);
    const openedPipeline = workspace.mode === 'pipeline'
      ? openPipelineSession(workspace.code)
      : null;
    if (openedPipeline?.session) {
      setPipeline(openedPipeline.session.definition);
      setMode('pipeline');
    } else {
      setPipeline(workspace.pipeline);
      setMode('code');
    }
    setLocalFunctions(workspace.localFunctions);
    setSelectedLocalFunctionId(workspace.selectedLocalFunctionId);
  }, [explorationDetail?.id]);

  useEffect(() => {
    if (preferences?.workspace) return;
    const data = loadedProgram.data as ProgramDetail | undefined;
    if (!data?.id) return;
    setProgramId(data.id);
    setName(data.name ?? 'Exploration');
    setDescription(data.description ?? '');
    const revision = data.revisions?.[0];
    if (!revision) return;
    const revisionSource = typeof revision.source_body === 'string'
      ? revision.source_body
      : defaultCode();
    setCode(revisionSource);
    const openedPipeline = data.editor_mode === 'pipeline'
      ? openPipelineSession(revisionSource)
      : null;
    if (openedPipeline?.session) {
      setPipeline(openedPipeline.session.definition);
      setMode('pipeline');
    } else {
      if (revision.pipeline_definition && typeof revision.pipeline_definition === 'object') {
        setPipeline(revision.pipeline_definition as PipelineDefinitionV1);
      }
      setMode('code');
    }
    if (Array.isArray(revision.inputs)) {
      setInputs((revision.inputs as Array<Record<string, unknown>>).map((input) => ({
        alias: String(input.alias),
        eventTypeKey: String(input.eventTypeKey),
        ...(input.displayUnitKey ? { displayUnitKey: String(input.displayUnitKey) } : {}),
        rowsBefore: Number(input.rowsBefore ?? 0),
        rowsAfter: Number(input.rowsAfter ?? 0),
        contextIsExplicit: Boolean(input.contextIsExplicit),
        includeOngoing: input.includeOngoing !== false,
      })));
    }
    if (typeof revision.id === 'string') setLastRevisionId(revision.id);
    if (revision.validation_report) setReport(revision.validation_report as AnalysisValidationReport);
  }, [loadedProgram.data, preferences?.workspace]);

  const functionCatalog = useMemo(() => {
    const byKey = new Map<string, AnalysisFunctionSummary>();
    for (const item of functions.data ?? []) byKey.set(item.function_key, item);
    for (const draft of localFunctions) byKey.set(draft.functionKey, toSessionSummary(draft));
    return [...byKey.values()];
  }, [functions.data, localFunctions]);

  const editorFunctionBindings = useMemo(() => functionCatalog.map((item) => {
    const local = localFunctions.find((draft) => draft.functionKey === item.function_key);
    const savedSource = (item as AnalysisFunctionSummary & { callable_source_body?: string }).callable_source_body;
    return {
      alias: analysisFunctionIdentifier(item.function_key),
      functionKey: item.function_key,
      functionKind: item.function_kind,
      ...(local?.sourceBody ? { sourceBody: local.sourceBody } : savedSource ? { sourceBody: savedSource } : {}),
    };
  }), [functionCatalog, localFunctions]);

  const bindingKinds = useMemo(
    () => Object.fromEntries(functionCatalog.map((item) => [item.function_key, item.function_kind])),
    [functionCatalog],
  );
  const checkedPipeline = useMemo(
    () => typeCheckPipeline(pipeline.inputAlias, pipeline.steps, bindingKinds),
    [pipeline, bindingKinds],
  );
  const activePipeline = checkedPipeline.definition ?? pipeline;
  // Source code is the only durable representation. Pipeline IR is derived
  // from the latest source when Pipeline is opened and writes back only after
  // an actual visual edit.
  const sourceBody = code;
  const sourceBodyRef = useRef(sourceBody);
  sourceBodyRef.current = sourceBody;

  function openPipelineMode(): void {
    const opened = openPipelineSession(sourceBodyRef.current, bindingKinds);
    if (!opened.session) {
      // A visually-created pipeline can be temporarily incomplete (for example,
      // immediately after adding a function step). Reuse the cached IR only
      // when it generates the exact current source; otherwise never risk
      // showing a stale graphical representation.
      if (sourceFromPipelineEdit(pipeline) === sourceBodyRef.current) {
        setMode('pipeline');
        setError(opened.diagnostics[0]?.message ?? 'Complete the highlighted pipeline step.');
        return;
      }
      setError(opened.diagnostics[0]?.message ?? 'This code cannot be represented by the visual pipeline.');
      setMode('code');
      return;
    }
    setPipeline(opened.session.definition);
    setMode('pipeline');
    setError(null);
  }

  function changePipeline(nextPipeline: PipelineDefinitionV1): void {
    const nextSource = sourceFromPipelineEdit(nextPipeline);
    setPipeline(nextPipeline);
    sourceBodyRef.current = nextSource;
    setCode(nextSource);
    setError(null);
  }
  const debouncedSource = useDebounced(sourceBody, 500);
  const debouncedInputs = useDebounced(inputs, 500);
  const sourceDiagnostics = mode === 'pipeline' ? checkedPipeline.diagnostics : editorDiagnostics;

  function workspaceState(overrides?: Partial<ExploreWorkspaceStateV1>): ExploreWorkspaceStateV1 {
    return {
      schemaVersion: 1,
      name,
      description,
      mode,
      autoRun,
      rangeMode,
      fixedRange,
      inputs,
      pipeline: openPipelineSession(sourceBodyRef.current, bindingKinds).session?.definition ?? activePipeline,
      code: sourceBodyRef.current,
      localFunctions,
      selectedLocalFunctionId,
      ...overrides,
    };
  }

  function referencedFunctionKeys(): string[] {
    const currentSource = sourceBodyRef.current;
    return functionCatalog
      .filter((item) => bodyReferences(currentSource, item.function_key, item.function_kind))
      .map((item) => item.function_key);
  }

  async function resolveBindings(): Promise<ResolvedBinding[]> {
    const keys = referencedFunctionKeys();
    return Promise.all(keys.map(async (key) => {
      const local = localFunctions.find((item) => item.functionKey === key);
      if (local) {
        const sourceMatchesLibrary = Boolean(local.libraryPublished && local.libraryRevisionId && local.librarySourceBody === local.sourceBody);
        return {
          key,
          alias: analysisFunctionIdentifier(key),
          functionKind: local.functionKind,
          sourceBody: local.sourceBody,
          options: {},
          ...(sourceMatchesLibrary ? { functionRevisionId: local.libraryRevisionId } : {}),
        };
      }
      const summary = (functions.data ?? []).find((item) => item.function_key === key);
      if (!summary) throw new Error(`Function ${key} is not in the available UDF catalog`);
      const detail = await api.getAnalysisFunction(summary.id) as { revisions?: Array<{ id: string; source_body: string }> };
      const preferredRevisionId = preferredSavedRevisionId(summary);
      const revision = preferredRevisionId
        ? detail.revisions?.find((item) => item.id === preferredRevisionId)
        : detail.revisions?.[0];
      if (!revision) throw new Error(`Function ${key} is listed in udf but has no saved revision to execute`);
      return {
        key,
        alias: analysisFunctionIdentifier(key),
        functionKind: summary.function_kind,
        sourceBody: revision.source_body,
        options: {},
        ...(summary.published_revision_id === revision.id ? { functionRevisionId: revision.id } : {}),
      };
    }));
  }

  async function persistWorkspace(overrides?: { localFunctions?: SessionFunctionDraft[] }): Promise<{ programId: string; explorationId: string }> {
    let currentProgramId = programId;
    if (!currentProgramId) {
      const created = await api.createAnalysisProgram({ name, description, editorMode: mode });
      currentProgramId = created.id;
      setProgramId(created.id);
    } else {
      await api.updateAnalysisProgram(currentProgramId, { name, description, editorMode: mode });
    }

    const nextFunctions = overrides?.localFunctions ?? localFunctions;
    const editorPreferences: ExploreEditorPreferencesV1 = {
      schemaVersion: 1,
      origin,
      workspace: workspaceState({ localFunctions: nextFunctions }),
    };

    let currentExplorationId = explorationId;
    if (!currentExplorationId) {
      const created = await api.createExploration({ programId: currentProgramId, autoRun, editorPreferences });
      currentExplorationId = created.id;
      navigate(`/explore/${created.id}`, { replace: true });
    } else {
      await api.updateExploration(currentExplorationId, { autoRun, editorPreferences });
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['explorations'] }),
      queryClient.invalidateQueries({ queryKey: ['exploration', currentExplorationId] }),
      queryClient.invalidateQueries({ queryKey: ['analysis-programs'] }),
    ]);
    return { programId: currentProgramId, explorationId: currentExplorationId };
  }

  const execute = useMutation({
    mutationFn: async () => {
      if (!capabilities.data) throw new Error('Analysis capabilities are not loaded');
      if (sourceDiagnostics.some((item) => item.severity === 'error')) {
        throw new Error(sourceDiagnostics[0]?.message ?? 'Analysis source is invalid');
      }
      const invalidLocal = localFunctions.find((item) => item.diagnostics.some((diagnostic) => diagnostic.severity === 'error') && referencedFunctionKeys().includes(item.functionKey));
      if (invalidLocal) throw new Error(`Session function ${invalidLocal.functionKey} has TypeScript errors`);
      const bindings = await resolveBindings();
      const range = rangeMode === 'rolling' ? rollingRange() : fixedRange;
      return executeAnalysis({
        panelKey: explorationId ?? 'new-exploration',
        sourceBody: sourceBodyRef.current,
        query: buildExploreQuery(debouncedInputs, range),
        capabilities: capabilities.data.analysis,
        functionBindings: bindings.map(({ functionRevisionId: _revisionId, key, ...binding }) => ({ ...binding, functionKey: key })),
      });
    },
    onSuccess: (response) => {
      setResult(response.result);
      setRunDiagnostics({ runtimeMs: response.durationMs, input: response.inputPointCount, output: response.outputPointCount });
      setError(null);
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  useEffect(() => {
    if (!autoRun || !capabilities.data || !debouncedInputs[0]?.eventTypeKey) return;
    void execute.mutateAsync().catch(() => undefined);
    const timer = window.setInterval(() => void execute.mutateAsync().catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [autoRun, capabilities.data, debouncedSource, JSON.stringify(debouncedInputs), JSON.stringify(localFunctions.map((item) => [item.functionKey, item.sourceBody])), rangeMode, fixedRange.from, fixedRange.to]);

  const saveWorkspace = useMutation({
    mutationFn: () => persistWorkspace(),
    onSuccess: () => setError(null),
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  const saveRevision = useMutation({
    mutationFn: async () => {
      const bindings = await resolveBindings();
      const unresolved = bindings.filter((binding) => !binding.functionRevisionId);
      if (unresolved.length) {
        throw new Error(`Publish these functions as passed library revisions before creating a program revision: ${unresolved.map((item) => item.key).join(', ')}`);
      }
      const persisted = await persistWorkspace();
      const currentSource = sourceBodyRef.current;
      const parsedPipeline = openPipelineSession(currentSource, bindingKinds).session?.definition;
      const queryContext = parsedPipeline?.queryContext ?? activePipeline.queryContext;
      const revision = await api.createAnalysisRevision(persisted.programId, {
        sourceBody: currentSource,
        ...(parsedPipeline ? { pipelineDefinition: parsedPipeline } : {}),
        defaultRange: rangeMode === 'rolling' ? '2d' : 'custom',
        outputOptions: {},
        inputs: inputs.map((input) => ({
          ...input,
          rowsBefore: input.contextIsExplicit ? input.rowsBefore : queryContext.rowsBefore,
          rowsAfter: input.contextIsExplicit ? input.rowsAfter : queryContext.rowsAfter,
        })),
        functionBindings: bindings.map((binding) => ({
          alias: binding.alias,
          functionRevisionId: binding.functionRevisionId!,
          options: binding.options,
        })),
      });
      const revisionId = String(revision.id);
      setLastRevisionId(revisionId);
      setReport(revision.validationReport as AnalysisValidationReport);
      await queryClient.invalidateQueries({ queryKey: ['analysis-program', persisted.programId] });
      return revision;
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  const publish = useMutation({
    mutationFn: async () => {
      if (!programId || !lastRevisionId) throw new Error('Save a passed revision first');
      return api.publishAnalysisRevision(programId, lastRevisionId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['analysis-programs'] }),
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  async function saveSessionFunctionToLibrary(draft: SessionFunctionDraft): Promise<void> {
    setSavingFunctionId(draft.id);
    setError(null);
    try {
      let functionId = draft.libraryFunctionId;
      if (!functionId) {
        const created = await api.createAnalysisFunction({
          functionKey: draft.functionKey,
          name: draft.name,
          description: draft.description,
          functionKind: draft.functionKind,
        });
        functionId = created.id;
      } else {
        await api.updateAnalysisFunction(functionId, { name: draft.name, description: draft.description });
      }
      const revision = await api.createAnalysisFunctionRevision(functionId, {
        alias: analysisFunctionIdentifier(draft.functionKey),
        functionKind: draft.functionKind,
        sourceBody: draft.sourceBody,
        parameterSchema: {},
        defaultOptions: {},
        outputMetadata: {},
      });
      const validation = revision.validationReport as AnalysisValidationReport;
      let published = false;
      if (validation.status === 'passed') {
        await api.publishAnalysisFunctionRevision(functionId, String(revision.id));
        published = true;
      }
      const updatedFunctions = localFunctions.map((item) => item.id === draft.id ? {
        ...item,
        libraryFunctionId: functionId,
        libraryRevisionId: String(revision.id),
        libraryPublished: published,
        librarySourceBody: item.sourceBody,
      } : item);
      setLocalFunctions(updatedFunctions);
      await queryClient.invalidateQueries({ queryKey: ['analysis-functions'] });
      if (explorationId) await persistWorkspace({ localFunctions: updatedFunctions });
      if (!published) setError(`The function revision was saved but not published because validation status is ${validation.status}.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSavingFunctionId(null);
    }
  }

  const originBanner = origin.kind === 'chart'
    ? <div className="analysis-origin-banner">
        <div><strong>Chart editing workspace</strong><span>{origin.chartTitle} · {origin.eventTypeKey}</span></div>
        <Link to={origin.returnPath}>Return to chart manager</Link>
      </div>
    : null;

  return <div className="analysis-workspace">
    {originBanner}
    <header className="analysis-toolbar">
      <div>
        <input className="analysis-title-input" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="analysis-description-input" value={description} placeholder="Description" onChange={(event) => setDescription(event.target.value)} />
        {!explorationId && <small>Standalone unsaved session. Save the workspace when you want to resume it later.</small>}
      </div>
      <div className="analysis-toolbar-actions">
        <label>Range<select value={rangeMode} onChange={(event) => setRangeMode(event.target.value as 'rolling' | 'fixed')}><option value="rolling">Rolling 2 days</option><option value="fixed">Fixed</option></select></label>
        {rangeMode === 'fixed' && <><input type="datetime-local" value={fixedRange.from.slice(0, 16)} onChange={(event) => setFixedRange({ ...fixedRange, from: new Date(event.target.value).toISOString() })} /><input type="datetime-local" value={fixedRange.to.slice(0, 16)} onChange={(event) => setFixedRange({ ...fixedRange, to: new Date(event.target.value).toISOString() })} /></>}
        <label className="analysis-checkbox"><input type="checkbox" checked={autoRun} onChange={(event) => setAutoRun(event.target.checked)} />Auto-run</label>
        <button type="button" onClick={() => execute.mutate()} disabled={execute.isPending || sourceDiagnostics.some((diagnostic) => diagnostic.severity === 'error')}>Run</button>
        <button type="button" onClick={() => saveWorkspace.mutate()} disabled={saveWorkspace.isPending}>Save workspace</button>
        <button type="button" onClick={() => saveRevision.mutate()} disabled={saveRevision.isPending}>Save revision</button>
        <button type="button" onClick={() => publish.mutate()} disabled={!lastRevisionId || report?.status !== 'passed' || publish.isPending}>Publish</button>
      </div>
    </header>
    {error && <div className="analysis-error">{error}</div>}
    <div className="analysis-layout">
      <aside>
        <InputEditor inputs={inputs} eventTypes={eventTypes.data ?? []} onChange={(value) => {
          setInputs(value);
          if (mode === 'pipeline' && value[0] && pipeline.inputAlias !== value[0].alias) {
            changePipeline({ ...pipeline, inputAlias: value[0].alias });
          }
        }} />
        <FunctionBindingEditor functions={functionCatalog} />
        <SdkReferenceDrawer />
      </aside>
      <main>
        <details className="analysis-panel analysis-workspace-section" open>
          <summary className="analysis-section-summary">
            <span>Plot</span>
            {runDiagnostics && <small>{runDiagnostics.runtimeMs} ms · {runDiagnostics.input} in · {runDiagnostics.output} out</small>}
          </summary>
          <div className="analysis-section-content">
            <AnalysisResultRenderer result={result} />
          </div>
        </details>

        <details className="analysis-panel analysis-workspace-section" open>
          <summary className="analysis-section-summary"><span>Transformation</span></summary>
          <div className="analysis-section-content">
            <div className="analysis-mode-tabs">
              <button type="button" className={mode === 'pipeline' ? 'active' : ''} onClick={openPipelineMode}>Pipeline</button>
              <button type="button" className={mode === 'code' ? 'active' : ''} onClick={() => setMode('code')}>Code</button>
            </div>
            {mode === 'pipeline'
              ? <PipelineEditor definition={activePipeline} functions={functionCatalog} onChange={changePipeline} />
              : functions.isPending
                ? <p>Loading saved UDF declarations…</p>
                : <AnalysisProgramEditor
                    sourceBody={code}
                    onSourceBodyChange={(nextCode) => { sourceBodyRef.current = nextCode; setCode(nextCode); setError(null); }}
                    inputAliases={inputs.map((input) => input.alias)}
                    functionBindings={editorFunctionBindings}
                    onTypeDiagnosticsChange={setEditorDiagnostics}
                    modelKey={explorationId ?? 'new-exploration'}
                    onRunShortcut={() => { if (!execute.isPending && !sourceDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) execute.mutate(); }}
                    onSaveShortcut={() => { if (!saveWorkspace.isPending) saveWorkspace.mutate(); }}
                  />}
          </div>
        </details>

        <details className="analysis-panel analysis-workspace-section" open>
          <summary className="analysis-section-summary"><span>Reusable functions</span></summary>
          <div className="analysis-section-content">
            <SessionFunctionWorkbench
              functions={localFunctions}
              selectedId={selectedLocalFunctionId}
              savingId={savingFunctionId}
              onChange={(changed) => setLocalFunctions((current) => current.map((item) => item.id === changed.id ? changed : item))}
              onSelect={setSelectedLocalFunctionId}
              onCreate={(kind, factory) => {
                const created = createSessionFunction(kind, factory);
                setLocalFunctions((current) => [...current, created]);
                setSelectedLocalFunctionId(created.id);
              }}
              onDelete={(id) => {
                setLocalFunctions((current) => current.filter((item) => item.id !== id));
                if (selectedLocalFunctionId === id) setSelectedLocalFunctionId(null);
              }}
              onSaveToLibrary={(draft) => void saveSessionFunctionToLibrary(draft)}
            />
          </div>
        </details>

        <details className="analysis-panel analysis-workspace-section">
          <summary className="analysis-section-summary"><span>Validation</span></summary>
          <div className="analysis-section-content"><ValidationReport report={report} /></div>
        </details>
      </main>
    </div>
    <details className="analysis-panel"><summary>Saved programs</summary><ul>{(programs.data ?? []).map((program: AnalysisProgramSummary) => <li key={program.id}>{program.name} — {program.published_validation_status ?? program.draft_validation_status ?? 'no revision'}</li>)}</ul></details>
  </div>;
}
