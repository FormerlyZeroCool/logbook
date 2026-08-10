/// <reference path="../worker-imports.d.ts" />

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

type MonacoWorkerEnvironment = {
  getWorker(moduleId: string, label: string): Worker;
};

const environment: MonacoWorkerEnvironment = {
  getWorker(_moduleId, label) {
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker();
    return new EditorWorker();
  },
};

let installed = false;

export function ensureAnalysisMonacoEnvironment(): typeof monaco {
  if (!installed) {
    installed = true;
    (globalThis as typeof globalThis & { MonacoEnvironment?: MonacoWorkerEnvironment }).MonacoEnvironment = environment;
    loader.config({ monaco });
  }
  return monaco;
}

export { monaco };
