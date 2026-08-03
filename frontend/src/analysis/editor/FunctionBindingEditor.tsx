import { analysisFunctionReference } from '@logbook/analysis-sdk';
import type { AnalysisFunctionSummary } from '../../types';

function revisionLabel(item: AnalysisFunctionSummary): string {
  if (item.is_session) return 'session';
  if (item.published_revision_id) return 'published';
  if (item.draft_revision_id) return 'saved draft';
  return 'no saved revision';
}

export function FunctionBindingEditor({ functions }: { functions: AnalysisFunctionSummary[] }) {
  return <section className="analysis-panel">
    <h2>Available functions</h2>
    <p>Every listed function is available through the nested typed <code>udf</code> object. For example: <code>udf.mappers.scale</code>, <code>udf.filters.positive_only</code>, <code>udf.reducers.mean</code>, and <code>udf.window_transforms.trailing_mean</code>.</p>
    <div className="analysis-function-catalog">
      {functions.map((item) => <article key={item.id}>
        <div className="analysis-function-title">
          <strong>{item.name}</strong>
          <span className="analysis-badge">{revisionLabel(item)}</span>
        </div>
        <code>{analysisFunctionReference(item.function_key, item.function_kind)}</code>
        <span>{item.function_kind}</span>
        {item.description && <p>{item.description}</p>}
      </article>)}
      {functions.length === 0 && <p>No reusable functions have been created yet.</p>}
    </div>
  </section>;
}
