import { AnalysisFunctionEditor } from '@logbook/analysis-editor';
import { analysisFunctionIdentifier, type AnalysisFunctionKind, type SourceDiagnostic } from '@logbook/analysis-sdk';
import type { SessionFunctionDraft } from '../session-types';
import { createClientId } from '../client-id';

const FUNCTION_KINDS: readonly AnalysisFunctionKind[] = [
  'event-filter',
  'point-map',
  'point-filter',
  'map-filter',
  'window-transform',
  'reducer',
  'series-transform',
];

const DEFAULT_BODIES: Record<AnalysisFunctionKind, string> = {
  'event-filter': 'return true;',
  'point-map': 'return value;',
  'point-filter': 'return value !== null;',
  'map-filter': 'return value === null ? MapFilterResult.drop() : MapFilterResult.keep(value);',
  'window-transform': 'const valid = window.validValues();\nreturn valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;',
  reducer: 'const valid = values.filter((value): value is number => value !== null);\nreturn valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null;',
  'series-transform': 'return series;',
};

export function createSessionFunction(kind: AnalysisFunctionKind = 'point-map'): SessionFunctionDraft {
  const suffix = createClientId().replaceAll('-', '').slice(0, 8);
  return {
    id: createClientId(),
    functionKey: `draft-${suffix}`,
    name: 'New session function',
    description: '',
    functionKind: kind,
    sourceBody: DEFAULT_BODIES[kind],
    diagnostics: [],
  };
}

export function SessionFunctionWorkbench({
  functions,
  selectedId,
  savingId,
  onChange,
  onSelect,
  onCreate,
  onDelete,
  onSaveToLibrary,
}: {
  functions: SessionFunctionDraft[];
  selectedId: string | null;
  savingId: string | null;
  onChange: (functionDraft: SessionFunctionDraft) => void;
  onSelect: (id: string | null) => void;
  onCreate: (kind?: AnalysisFunctionKind) => void;
  onDelete: (id: string) => void;
  onSaveToLibrary: (functionDraft: SessionFunctionDraft) => void;
}) {
  const selected = functions.find((item) => item.id === selectedId) ?? null;
  return <section className="analysis-panel session-function-workbench">
    <div className="analysis-panel-heading">
      <div>
        <h2>Session UDFs</h2>
        <p>Develop typed callbacks here and use them immediately. They remain local until saved to the shared function library.</p>
      </div>
      <button type="button" onClick={() => onCreate()}>New UDF</button>
    </div>
    <div className="session-function-layout">
      <nav className="session-function-list" aria-label="Session functions">
        {functions.length === 0 && <p>No session UDFs yet.</p>}
        {functions.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? 'active' : ''} onClick={() => onSelect(item.id)}>
          <strong>{item.name}</strong>
          <code>{item.functionKey}</code>
          <span>{item.functionKind}</span>
          {item.libraryRevisionId && <small>Saved to library</small>}
        </button>)}
      </nav>
      {selected ? <div className="session-function-editor">
        <div className="analysis-form-grid">
          <label>Name<input value={selected.name} onChange={(event) => onChange({ ...selected, name: event.target.value })} /></label>
          <label>Key<input value={selected.functionKey} disabled={Boolean(selected.libraryFunctionId)} onChange={(event) => onChange({ ...selected, functionKey: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-') })} /></label>
          <label>Kind<select value={selected.functionKind} disabled={Boolean(selected.libraryFunctionId)} onChange={(event) => {
            const functionKind = event.target.value as AnalysisFunctionKind;
            onChange({ ...selected, functionKind, sourceBody: DEFAULT_BODIES[functionKind], diagnostics: [] });
          }}>{FUNCTION_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}</select></label>
          <label className="analysis-form-span">Description<input value={selected.description} onChange={(event) => onChange({ ...selected, description: event.target.value })} /></label>
        </div>
        <AnalysisFunctionEditor
          functionKind={selected.functionKind}
          functionAlias={analysisFunctionIdentifier(selected.functionKey || 'draft-function')}
          sourceBody={selected.sourceBody}
          onSourceBodyChange={(sourceBody) => onChange({ ...selected, sourceBody })}
          onTypeDiagnosticsChange={(diagnostics: SourceDiagnostic[]) => onChange({ ...selected, diagnostics })}
          modelKey={`session-function-${selected.id}`}
          toolbarLabel="Session UDF"
          height={360}
        />
        <div className="analysis-toolbar-actions">
          <button type="button" className="danger" onClick={() => onDelete(selected.id)}>Delete local draft</button>
          <button
            type="button"
            onClick={() => onSaveToLibrary(selected)}
            disabled={savingId === selected.id || !selected.name.trim() || !/^[a-z][a-z0-9_-]{0,63}$/.test(selected.functionKey) || selected.diagnostics.some((diagnostic) => diagnostic.severity === 'error')}
          >{selected.libraryFunctionId ? 'Save new library revision' : 'Save to function library'}</button>
        </div>
      </div> : <div className="analysis-empty-state"><p>Create a session UDF to edit it with the TypeScript language service.</p></div>}
    </div>
  </section>;
}
