import { AnalysisFunctionEditor } from '@logbook/analysis-editor';
import {
  analysisFunctionIdentifier,
  createAnalysisFunctionTemplate,
  inferAnalysisFunctionKind,
  type AnalysisFunctionKind,
  type SourceDiagnostic,
} from '@logbook/analysis-sdk';
import type { SessionFunctionDraft } from '../session-types';

const TEMPLATE_BUTTONS: readonly { kind: AnalysisFunctionKind; label: string }[] = [
  { kind: 'point-map', label: 'New mapper' },
  { kind: 'point-filter', label: 'New filter' },
  { kind: 'reducer', label: 'New reducer' },
  { kind: 'window-transform', label: 'New window transform' },
  { kind: 'event-filter', label: 'New event filter' },
  { kind: 'map-filter', label: 'New map/filter' },
  { kind: 'series-transform', label: 'New series transform' },
];

export function createSessionFunction(kind: AnalysisFunctionKind = 'point-map'): SessionFunctionDraft {
  const suffix = crypto.randomUUID().slice(0, 8);
  const functionKey = `draft_${suffix}`;
  return {
    id: crypto.randomUUID(),
    functionKey,
    name: 'New session function',
    description: '',
    functionKind: kind,
    sourceBody: createAnalysisFunctionTemplate(kind, analysisFunctionIdentifier(functionKey)),
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
  const inferredKind = selected
    ? inferAnalysisFunctionKind(selected.sourceBody)
    : null;

  return <div className="session-function-workbench">
    <div className="analysis-panel-heading">
      <div>
        <h2>Session functions</h2>
        <p>Choose a template, then edit the signature freely. The parameter and return types determine the UDF category.</p>
      </div>
    </div>
    <div className="analysis-template-buttons" aria-label="Create UDF from template">
      {TEMPLATE_BUTTONS.map((template) => <button key={template.kind} type="button" onClick={() => onCreate(template.kind)}>{template.label}</button>)}
    </div>
    <div className="session-function-layout">
      <nav className="session-function-list" aria-label="Session functions">
        {functions.length === 0 && <p>No session functions yet.</p>}
        {functions.map((item) => <button key={item.id} type="button" className={item.id === selectedId ? 'active' : ''} onClick={() => onSelect(item.id)}>
          <strong>{item.name}</strong>
          <code>{item.functionKey}</code>
          <span>{inferAnalysisFunctionKind(item.sourceBody) ?? 'invalid signature'}</span>
          {item.libraryRevisionId && <small>Saved to library</small>}
        </button>)}
      </nav>
      {selected ? <div className="session-function-editor">
        <div className="analysis-form-grid">
          <label>Name<input value={selected.name} onChange={(event) => onChange({ ...selected, name: event.target.value })} /></label>
          <label>Key<input value={selected.functionKey} disabled={Boolean(selected.libraryFunctionId)} onChange={(event) => onChange({ ...selected, functionKey: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} /></label>
          <div className="analysis-inferred-kind"><span>Inferred category</span><strong>{inferredKind ?? 'Signature does not match a supported UDF type'}</strong></div>
          <label className="analysis-form-span">Description<input value={selected.description} onChange={(event) => onChange({ ...selected, description: event.target.value })} /></label>
        </div>
        <AnalysisFunctionEditor
          functionKind={inferredKind ?? selected.functionKind}
          functionAlias={analysisFunctionIdentifier(selected.functionKey || 'draft_function')}
          sourceBody={selected.sourceBody}
          onSourceBodyChange={(sourceBody) => {
            const functionKind = inferAnalysisFunctionKind(sourceBody);
            onChange({
              ...selected,
              sourceBody,
              ...(functionKind ? { functionKind } : {}),
            });
          }}
          onTypeDiagnosticsChange={(diagnostics: SourceDiagnostic[]) => onChange({ ...selected, diagnostics })}
          modelKey={`session-function-${selected.id}`}
          toolbarLabel="Session function"
          height={360}
        />
        <div className="analysis-toolbar-actions">
          <button type="button" className="danger" onClick={() => onDelete(selected.id)}>Delete local draft</button>
          <button
            type="button"
            onClick={() => onSaveToLibrary({ ...selected, ...(inferredKind ? { functionKind: inferredKind } : {}) })}
            disabled={savingId === selected.id || !inferredKind || !selected.name.trim() || !/^[a-z][a-z0-9_]{0,63}$/.test(selected.functionKey) || selected.diagnostics.some((diagnostic) => diagnostic.severity === 'error')}
          >{selected.libraryFunctionId ? 'Save new library revision' : 'Save to function library'}</button>
        </div>
      </div> : <div className="analysis-empty-state"><p>Create a session function from one of the templates to edit its signature and body.</p></div>}
    </div>
  </div>;
}
