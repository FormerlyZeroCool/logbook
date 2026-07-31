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

type HiddenAreasCapableEditor = import('monaco-editor').editor.IStandaloneCodeEditor & {
  // Monaco 0.52 exposes this at runtime, but omits it from IStandaloneCodeEditor.
  setHiddenAreas(ranges: readonly import('monaco-editor').Range[]): void;
};

function setEditorHiddenAreas(
  editor: import('monaco-editor').editor.IStandaloneCodeEditor,
  ranges: readonly import('monaco-editor').Range[],
): void {
  const hiddenAreasEditor = editor as HiddenAreasCapableEditor;
  hiddenAreasEditor.setHiddenAreas(ranges);
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

function generatedFunctionStartLine(sourceDocument: AnalysisSourceDocument): number {
  const index = sourceDocument.text.split('\n').findIndex((line) => line.startsWith('function '));
  return index < 0 ? sourceDocument.bodyStartLine : index + 1;
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
  const [showUdfDeclaration, setShowUdfDeclaration] = useState(false);
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
    }
  }, [document, editorText, sourceBody, sourceDocument.text]);

  useEffect(() => {
    const releases = (document.extraLibraries ?? []).map(retainAnalysisEditorLibrary);
    return () => { for (const release of releases) release(); };
  }, [document]);

  const applyGeneratedPresentation = useCallback((
    editor: import('monaco-editor').editor.IStandaloneCodeEditor,
  ): void => {
    const lineCount = editor.getModel()?.getLineCount() ?? sourceDocument.bodyEndLine;
    const decorationRanges = generatedDecorationRanges(sourceDocument, lineCount);
    const hiddenUdfRanges = (sourceDocument.hiddenGeneratedRanges ?? []).map((range) => new monaco.Range(
      range.startLineNumber,
      1,
      range.endLineNumber,
      1,
    ));
    const hoverMessage = { value: document.generatedRegionMessage ?? 'Generated wrapper; only the body is persisted.' };
    const decorations = decorationRanges.map((range) => ({
      range,
      options: { isWholeLine: true, className: 'logbook-analysis-editor-generated', hoverMessage },
    }));
    if (generatedDecorationsRef.current) generatedDecorationsRef.current.set(decorations);
    else generatedDecorationsRef.current = editor.createDecorationsCollection(decorations);
    setEditorHiddenAreas(editor, showUdfDeclaration ? [] : hiddenUdfRanges);
    if (!showUdfDeclaration) editor.revealLineNearTop(generatedFunctionStartLine(sourceDocument));
  }, [document.generatedRegionMessage, showUdfDeclaration, sourceDocument]);

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

  const hasUdfDeclaration = (sourceDocument.hiddenGeneratedRanges?.length ?? 0) > 0;
  const allDiagnostics = [...typeDiagnostics, ...diagnostics];
  const errorCount = allDiagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = allDiagnostics.filter((item) => item.severity === 'warning').length;
  const rootClassName = ['logbook-analysis-editor', className].filter(Boolean).join(' ');

  return <div className={rootClassName} data-udf-declaration={hasUdfDeclaration ? (showUdfDeclaration ? 'visible' : 'hidden') : 'absent'}>
    <div className="logbook-analysis-editor-toolbar">
      <span><strong>{toolbarLabel}</strong> · strict · browser language service · ⌘/Ctrl+S save · ⌘/Ctrl+Enter run</span>
      {hasUdfDeclaration && <label className="logbook-analysis-editor-generated-toggle">
        <input
          type="checkbox"
          checked={showUdfDeclaration}
          onChange={(event) => setShowUdfDeclaration(event.target.checked)}
        />
        Show generated udf object
      </label>}
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
