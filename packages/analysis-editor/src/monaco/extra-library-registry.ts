import type { IDisposable } from 'monaco-editor';
import { monaco } from './create-monaco-environment.js';
import type { AnalysisEditorExtraLibrary } from '../types.js';

type LibraryEntry = {
  content: string;
  references: number;
  disposable: IDisposable;
};

const libraries = new Map<string, LibraryEntry>();

export function retainAnalysisEditorLibrary(library: AnalysisEditorExtraLibrary): () => void {
  const existing = libraries.get(library.uri);
  if (existing) {
    if (existing.content !== library.content) {
      throw new Error(`Analysis editor library URI ${library.uri} was registered with different content`);
    }
    existing.references += 1;
  } else {
    const disposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(library.content, library.uri);
    libraries.set(library.uri, { content: library.content, references: 1, disposable });
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const entry = libraries.get(library.uri);
    if (!entry) return;
    entry.references -= 1;
    if (entry.references === 0) {
      entry.disposable.dispose();
      libraries.delete(library.uri);
    }
  };
}
