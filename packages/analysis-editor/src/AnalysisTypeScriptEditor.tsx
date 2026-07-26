import Editor, { type OnMount } from '@monaco-editor/react';
import type { SourceDiagnostic } from '@logbook/analysis-sdk';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { markerToSourceDiagnostic } from './diagnostics.js';
import { configureAnalysisTypeScript } from './monaco/configure-typescript.js';
import { retainAnalysisEditorLibrary } from './monaco/extra-library-registry.js';
import { ensureAnalysisMonacoEnvironment, monaco } from './monaco/create-monaco-environment.js';
import type { AnalysisTypeScriptEditorProps } from './types.js';

ensureAnalysisMonacoEnvironment();

function sanitizeModelKey(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]/g, '_');
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
  const path = `file:///logbook-analysis/${sanitizeModelKey(modelKey ?? generatedId)}.ts`;
  const sourceDocument = useMemo(() => document.build(sourceBody), [document, sourceBody]);
  const [editorText, setEditorText] = useState(sourceDocument.text);
  const [wrapperModified, setWrapperModified] = useState(false);
  const [typeDiagnostics, setTypeDiagnostics] = useState<SourceDiagnostic[]>([]);
  const editorRef = useRef<import('monaco-editor').editor.IStandaloneCodeEditor | null>(null);
  const documentKeyRef = useRef(document.key);
  const saveShortcutRef = useRef(onSaveShortcut);
  const runShortcutRef = useRef(onRunShortcut);

  useEffect(() => { saveShortcutRef.current = onSaveShortcut; }, [onSaveShortcut]);
  useEffect(() => { runShortcutRef.current = onRunShortcut; }, [onRunShortcut]);

  useEffect(() => {
    const currentBody = document.extract(editorText);
    if (documentKeyRef.current !== document.key || currentBody !== sourceBody) {
      documentKeyRef.current = document.key;
      setEditorText(sourceDocument.text);
      setWrapperModified(false);
    }
  }, [document, editorText, sourceBody, sourceDocument.text]);

  useEffect(() => {
    const releases = (document.extraLibraries ?? []).map(retainAnalysisEditorLibrary);
    return () => { for (const release of releases) release(); };
  }, [document]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    const bodyStart = sourceDocument.bodyStartLine;
    const bodyEnd = sourceDocument.bodyEndLine;
    const lineCount = editor.getModel()?.getLineCount() ?? bodyEnd + 1;
    const hoverMessage = { value: document.generatedRegionMessage ?? 'Generated wrapper; only the body is persisted.' };

    editor.createDecorationsCollection([
      {
        range: new monaco.Range(1, 1, Math.max(1, bodyStart - 1), 1),
        options: { isWholeLine: true, className: 'logbook-analysis-editor-generated', hoverMessage },
      },
      {
        range: new monaco.Range(bodyEnd + 1, 1, lineCount, 1),
        options: { isWholeLine: true, className: 'logbook-analysis-editor-generated', hoverMessage },
      },
    ]);
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

  const allDiagnostics = [...typeDiagnostics, ...diagnostics];
  const errorCount = allDiagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = allDiagnostics.filter((item) => item.severity === 'warning').length;
  const rootClassName = ['logbook-analysis-editor', className].filter(Boolean).join(' ');

  return <div className={rootClassName}>
    <div className="logbook-analysis-editor-toolbar">
      <span><strong>{toolbarLabel}</strong> · strict · browser language service · ⌘/Ctrl+S save · ⌘/Ctrl+Enter run</span>
      <span className="logbook-analysis-editor-diagnostic-count">{errorCount} errors · {warningCount} warnings</span>
      <button type="button" onClick={() => void editorRef.current?.getAction('editor.action.formatDocument')?.run()} disabled={readOnly}>Format</button>
      {wrapperModified && <button type="button" onClick={() => { setEditorText(sourceDocument.text); setWrapperModified(false); }}>Reset generated signature</button>}
    </div>
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
