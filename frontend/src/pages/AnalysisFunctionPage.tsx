import { AnalysisFunctionEditor } from '@logbook/analysis-editor';
import {
  analysisFunctionIdentifier,
  analysisFunctionReference,
  createAnalysisFunctionFactoryTemplate,
  createAnalysisFunctionTemplate,
  inferAnalysisFunctionKind,
  type AnalysisFunctionKind,
  type AnalysisValidationReport,
  type SourceDiagnostic,
} from '@logbook/analysis-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ValidationReport } from '../analysis/validation/ValidationReport';

export function AnalysisFunctionPage() {
  const { functionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const factoryTemplateRequested = searchParams.get('template') === 'factory';
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['analysis-function', functionId], queryFn: () => api.getAnalysisFunction(functionId) });
  const item = detail.data as {
    name?: string;
    function_key?: string;
    function_kind?: AnalysisFunctionKind;
    description?: string;
    is_system?: boolean;
    published_revision_id?: string | null;
    revisions?: Array<{ id: string; source_body: string; validation_report?: AnalysisValidationReport; validation_status?: string; revision?: number }>;
  } | undefined;
  const [source, setSource] = useState('');
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [report, setReport] = useState<AnalysisValidationReport | null>(null);
  const [typeDiagnostics, setTypeDiagnostics] = useState<SourceDiagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const revision = item.revisions?.[0];
    const functionKind = item.function_kind ?? 'point-map';
    const alias = analysisFunctionIdentifier(item.function_key ?? 'udf');
    setSource(revision?.source_body ?? (factoryTemplateRequested
      ? createAnalysisFunctionFactoryTemplate(functionKind, alias)
      : createAnalysisFunctionTemplate(functionKind, alias)));
    setRevisionId(revision?.id ?? null);
    setReport(revision?.validation_report ?? null);
  }, [detail.data, factoryTemplateRequested]);

  const storedKind = item?.function_kind ?? 'point-map';
  const inferredKind = inferAnalysisFunctionKind(source, storedKind);

  const save = useMutation({
    mutationFn: () => {
      if (!inferredKind) throw new Error('The function signature does not match a supported UDF type.');
      return api.createAnalysisFunctionRevision(functionId, {
        alias: analysisFunctionIdentifier(item?.function_key ?? 'udf'),
        functionKind: inferredKind,
        sourceBody: source,
        outputMetadata: { inferredFunctionKind: inferredKind },
      });
    },
    onSuccess: (revision) => {
      setRevisionId(String(revision.id));
      setReport(revision.validationReport as AnalysisValidationReport);
      setError(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis-function', functionId] }),
        queryClient.invalidateQueries({ queryKey: ['analysis-functions'] }),
      ]);
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  const publish = useMutation({
    mutationFn: () => api.publishAnalysisFunctionRevision(functionId, revisionId!),
    onSuccess: () => {
      setError(null);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['analysis-function', functionId] }),
        queryClient.invalidateQueries({ queryKey: ['analysis-functions'] }),
      ]);
    },
    onError: (value) => setError(value instanceof Error ? value.message : String(value)),
  });

  if (!item) return <div className="analysis-panel">Loading function…</div>;
  const key = item.function_key ?? 'udf';
  const effectiveKind = inferredKind ?? storedKind;

  return <div className="analysis-function-page">
    <header className="analysis-toolbar">
      <div>
        <Link to="/analysis-functions">← Functions</Link>
        <h1>{item.name}</h1>
        <code>{analysisFunctionReference(key, effectiveKind)}</code>
        <p>{item.description}</p>
      </div>
      <div className="analysis-toolbar-actions">
        <span>{inferredKind ? `Inferred: ${inferredKind}` : 'Unsupported signature'}</span>
        {item.is_system && <span>System</span>}
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !inferredKind || item.is_system || typeDiagnostics.some((diagnostic) => diagnostic.severity === 'error')}>Save revision</button>
        <button type="button" onClick={() => publish.mutate()} disabled={publish.isPending || report?.status !== 'passed' || item.is_system || !revisionId}>Publish</button>
      </div>
    </header>
    {error && <div className="analysis-error">{error}</div>}
    <div className="analysis-layout single">
      <main>
        <section className="analysis-panel">
          <h2>Function signature and body</h2>
          <p className="analysis-signature">Edit the parameter and return types directly. A valid signature automatically moves the function to the matching <code>udf</code> collection. Configurable UDFs return a typed callback such as <code>NumericMapper</code>.</p>
          {!item.is_system && <div className="analysis-template-buttons" aria-label="Replace function with template">
            <button type="button" onClick={() => setSource(createAnalysisFunctionTemplate(effectiveKind, analysisFunctionIdentifier(key)))}>Direct callback template</button>
            <button type="button" onClick={() => setSource(createAnalysisFunctionFactoryTemplate(effectiveKind, analysisFunctionIdentifier(key)))}>Typed factory template</button>
          </div>}
          <AnalysisFunctionEditor
            sourceBody={source}
            onSourceBodyChange={setSource}
            readOnly={Boolean(item.is_system)}
            functionKind={effectiveKind}
            functionAlias={analysisFunctionIdentifier(key)}
            onTypeDiagnosticsChange={setTypeDiagnostics}
            modelKey={`function-${functionId}`}
            onSaveShortcut={() => {
              if (!save.isPending && inferredKind && !item.is_system && !typeDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) save.mutate();
            }}
          />
        </section>
        <section className="analysis-panel"><h2>Validation</h2><ValidationReport report={report} /></section>
      </main>
    </div>
  </div>;
}
