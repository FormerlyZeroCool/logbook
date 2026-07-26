import { analysisFunctionIdentifier } from '@logbook/analysis-sdk';
import type { AnalysisFunctionSummary } from '../../types';
export function FunctionBindingEditor({ functions }: { functions: AnalysisFunctionSummary[] }) {
  return <section className="analysis-panel"><h2>Available functions</h2><div className="analysis-function-catalog">{functions.filter((item) => item.published_revision_id).map((item) => <article key={item.id}><div className="analysis-function-title"><strong>{item.name}</strong>{item.is_session && <span className="analysis-badge">session</span>}</div><code>{item.function_key}</code><small>Code alias: <code>{analysisFunctionIdentifier(item.function_key)}</code></small><span>{item.function_kind}</span>{item.description && <p>{item.description}</p>}</article>)}</div></section>;
}
