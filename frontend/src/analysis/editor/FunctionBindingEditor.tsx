import { analysisFunctionPropertyIdentifier } from '@logbook/analysis-sdk';
import type { AnalysisFunctionSummary } from '../../types';

function udfReference(functionKey: string): string {
  return `udf.${analysisFunctionPropertyIdentifier(functionKey)}`;
}

function revisionLabel(item: AnalysisFunctionSummary): string {
  if (item.is_session) return 'session';
  if (item.published_revision_id) return 'published';
  if (item.draft_revision_id) return 'saved draft';
  return 'no saved revision';
}

export function FunctionBindingEditor({ functions }: { functions: AnalysisFunctionSummary[] }) {
  return <section className="analysis-panel">
    <h2>Available functions</h2>
    <p>Every function shown here is a property of the generated <code>udf</code> object and appears after typing <code>udf.</code>. Execution uses the published revision first, then the newest saved revision.</p>
    <div className="analysis-function-catalog">
      {functions.map((item) => <article key={item.id}>
        <div className="analysis-function-title">
          <strong>{item.name}</strong>
          <span className="analysis-badge">{revisionLabel(item)}</span>
        </div>
        <code>{udfReference(item.function_key)}</code>
        <span>{item.function_kind}</span>
        {item.description && <p>{item.description}</p>}
      </article>)}
      {functions.length === 0 && <p>No UDFs have been created yet.</p>}
    </div>
  </section>;
}
