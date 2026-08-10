import type { SourceDiagnostic } from '@logbook/analysis-sdk';
import { MarkerSeverity, type editor } from 'monaco-editor';

export function markerToSourceDiagnostic(marker: editor.IMarkerData, bodyStartLine: number): SourceDiagnostic {
  const line = Math.max(1, marker.startLineNumber - bodyStartLine + 1);
  const endLine = Math.max(line, marker.endLineNumber - bodyStartLine + 1);
  const markerCode = marker.code;
  const code = markerCode === undefined
    ? 'typescript'
    : `typescript_${typeof markerCode === 'string' ? markerCode : markerCode.value}`;

  return {
    severity: marker.severity === MarkerSeverity.Error ? 'error' : 'warning',
    code,
    message: marker.message,
    line,
    column: marker.startColumn,
    endLine,
    endColumn: marker.endColumn,
  };
}
