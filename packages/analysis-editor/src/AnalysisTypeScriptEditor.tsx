import Editor, { type OnMount } from '@monaco-editor/react';
import type { AnalysisSourceDocument, SourceDiagnostic } from '@logbook/analysis-sdk';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { markerToSourceDiagnostic } from './diagnostics.js';
import { configureAnalysisTypeScript } from './monaco/configure-typescript.js';
import { retainAnalysisEditorLibrary } from './monaco/extra-library-registry.js';
import { ensureAnalysisMonacoEnvironment, monaco } from './monaco/create-monaco-environment.js';
import type { AnalysisTypeScriptEditorProps } from './types.js';

ensureAnalysisMonacoEnvironment();

function sanitizeModelKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generatedDecorationRanges(sourceDocument: AnalysisSourceDocument, lineCount: number): import('monaco-editor').Range[] {
  const ranges: import('monaco-editor').Range[] = [];
  if (sourceDocument.bodyStartLine > 1) {
    ranges.push(new monaco.Range(1, 1, sourceDocument.bodyStartLine - 1, 1));
  }
  if (sourceDocument.bodyEndLine < lineCount) {
    ranges.push(new monaco.Range(sourceDocument.bodyEndLine + 1, 1, lineCount, 1));
  }
  return ranges;
}

export function AnalysisTypeScriptEditor({
  sourceBody,
  onSourceBodyChange,
  document,
  diagnostics = [],
  onTypeDiagnosticsChange,
  readOnly = false,
  modelKey,
  height = 430,
  theme = 'vs-dark',
  onSaveShortcut,
  onRunShortcut,
  toolbarLabel = 'TypeScript',
  className = '',
}: AnalysisTypeScriptEditorProps) {
  const generatedId = sanitizeModelKey(useId());
  const documentVersion = stableHash(document.key);
  const path = `file:///logbook-analysis/${sanitizeModelKey(modelKey ?? generatedId)}-${documentVersion}.ts`;
  const sourceDocument = useMemo(() => document.build(sourceBody), [document, sourceBody]);
  const [editorText, setEditorText] = useState(sourceDocument.text);
  const [wrapperModified, setWrapperModified] = useState(false);
  const [showGeneratedDeclarations, setShowGeneratedDeclarations] = useState(false);
  const [typeDiagnostics, setTypeDiagnostics] = useState<SourceDiagnostic[]>([]);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const generatedDecorationsRef = useRef<import('monaco-editor').editor.IEditorDecorationsCollection | null>(null);
  const sourceDocumentRef = useRef(sourceDocument);

  const documentKeyRef = useRef(document.key);
  const saveShortcutRef = useRef(onSaveShortcut);
  const runShortcutRef = useRef(onRunShortcut);

  sourceDocumentRef.current = sourceDocument;

  useEffect(() => { saveShortcutRef.current = onSaveShortcut; }, [onSaveShortcut]);
  useEffect(() => { runShortcutRef.current = onRunShortcut; }, [onRunShortcut]);

  useEffect(() => {
    const currentBody = document.extract(editorText);
    if (documentKeyRef.current !== document.key || currentBody !== sourceBody) {
      documentKeyRef.current = document.key;
      setEditorText(sourceDocument.text);
      setWrapperModified(false);
      setShowGeneratedDeclarations(false);
    }
  }, [document, editorText, sourceBody, sourceDocument.text]);

  useEffect(() => {
    const releases = (document.extraLibraries ?? []).map(retainAnalysisEditorLibrary);
    return () => { for (const release of releases) release(); };
  }, [document.extraLibraries]);

  const applyGeneratedPresentation = useCallback((
    editor: import('monaco-editor').editor.IStandaloneCodeEditor,
  ): void => {
    const lineCount = editor.getModel()?.getLineCount() ?? sourceDocument.bodyEndLine;
    const decorationRanges = generatedDecorationRanges(sourceDocument, lineCount);
    const hoverMessage = { value: document.generatedRegionMessage ?? 'Generated wrapper; only the body is persisted.' };
    const decorations = decorationRanges.map((range) => ({
      range,
      options: { isWholeLine: true, className: 'logbook-analysis-editor-generated', hoverMessage },
    }));
    if (generatedDecorationsRef.current) generatedDecorationsRef.current.set(decorations);
    else generatedDecorationsRef.current = editor.createDecorationsCollection(decorations);
  }, [document.generatedRegionMessage, sourceDocument]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const frame = window.requestAnimationFrame(() => applyGeneratedPresentation(editor));
    return () => window.cancelAnimationFrame(frame);
  }, [applyGeneratedPresentation]);

  useEffect(() => () => generatedDecorationsRef.current?.clear(), []);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    applyGeneratedPresentation(editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyA, () => {
      const currentDocument = sourceDocumentRef.current;
      const model = editor.getModel();
      const endColumn = model?.getLineMaxColumn(currentDocument.bodyEndLine) ?? 1;
      editor.setSelection(new monaco.Selection(
        currentDocument.bodyStartLine,
        1,
        currentDocument.bodyEndLine,
        endColumn,
      ));
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveShortcutRef.current?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runShortcutRef.current?.());
  };

  const handleTextChange = (nextValue: string | undefined) => {
    const text = nextValue ?? '';
    setEditorText(text);
    const body = document.extract(text);
    if (body === null) {
      setWrapperModified(true);
      return;
    }

    const expected = document.build(body);
    setWrapperModified(text !== expected.text);
    onSourceBodyChange(body);
  };

  const generatedDeclarations = document.generatedDeclarations?.trim() ?? '';
  const hasGeneratedDeclarations = generatedDeclarations.length > 0;
  const allDiagnostics = [...typeDiagnostics, ...diagnostics];
  const errorCount = allDiagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = allDiagnostics.filter((item) => item.severity === 'warning').length;
  const rootClassName = ['logbook-analysis-editor', className].filter(Boolean).join(' ');

  return <div className={rootClassName} data-editor-schema="v13" data-generated-declarations={hasGeneratedDeclarations ? (showGeneratedDeclarations ? 'visible' : 'hidden') : 'absent'}>
    <div className="logbook-analysis-editor-toolbar">
      <span><strong>{toolbarLabel}</strong> · strict · browser language service · ⌘/Ctrl+S save · ⌘/Ctrl+Enter run</span>
      {hasGeneratedDeclarations && <label className="logbook-analysis-editor-generated-toggle">
        <input
          type="checkbox"
          checked={showGeneratedDeclarations}
          onChange={(event) => setShowGeneratedDeclarations(event.target.checked)}
        />
        Show generated declarations
      </label>}
      <span className="logbook-analysis-editor-diagnostic-count">{errorCount} errors · {warningCount} warnings</span>
      <button type="button" onClick={() => void editorRef.current?.getAction('editor.action.formatDocument')?.run()} disabled={readOnly}>Format</button>
      {wrapperModified && <button type="button" onClick={() => { setEditorText(sourceDocument.text); setWrapperModified(false); }}>Reset generated signature</button>}
    </div>
    {showGeneratedDeclarations && hasGeneratedDeclarations && <pre className="logbook-analysis-editor-generated-declarations" aria-label="Generated UDF declarations">{generatedDeclarations}</pre>}
    <Editor
      height={height}
      path={path}
      language="typescript"
      theme={theme}
      value={editorText}
      beforeMount={configureAnalysisTypeScript}
      onMount={handleMount}
      onChange={handleTextChange}
      onValidate={(markers: import('monaco-editor').editor.IMarkerData[]) => {
        const next = markers.map((marker) => markerToSourceDiagnostic(marker, sourceDocument.bodyStartLine));
        setTypeDiagnostics(next);
        onTypeDiagnosticsChange?.(next);
      }}
      options={{
        readOnly,
        automaticLayout: true,
        minimap: { enabled: true, showSlider: 'mouseover' },
        stickyScroll: { enabled: true },
        fontSize: 14,
        lineHeight: 22,
        lineNumbers: 'on',
        tabSize: 2,
        insertSpaces: true,
        formatOnPaste: true,
        formatOnType: true,
        folding: true,
        glyphMargin: true,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: true },
        guides: { bracketPairs: true, indentation: true },
        inlayHints: { enabled: 'on' },
        quickSuggestions: { other: true, comments: false, strings: true },
        suggestOnTriggerCharacters: true,
        parameterHints: { enabled: true },
        renderValidationDecorations: 'on',
        wordWrap: 'off',
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        padding: { top: 10, bottom: 10 },
      }}
    />
    {wrapperModified && <p className="logbook-analysis-editor-note">The function signature is generated from the supplied document contract. Wrapper edits are not saved or executed.</p>}
    {allDiagnostics.length > 0 && <ul className="logbook-analysis-editor-diagnostics">{allDiagnostics.map((item, index) => <li key={`${item.code}-${item.line}-${index}`} className={item.severity}>{item.line}:{item.column} {item.message}</li>)}</ul>}
  </div>;
}
