import type { SerializedScalar } from '@logbook/analysis-sdk';

function displayValue(value: number | string | null): string {
  return value === null ? '—' : String(value);
}

export function ScalarResult({ result }: { result: SerializedScalar }) {
  const rendered = displayValue(result.value);
  return (
    <article
      className={`analysis-scalar analysis-scalar-${result.value === null ? 'null' : typeof result.value}`}
      data-analysis-result-kind="scalar"
      data-analysis-scalar-type={result.value === null ? 'null' : typeof result.value}
      data-analysis-scalar-value={rendered}
    >
      <span>{result.label ?? 'Result'}</span>
      <strong>
        {rendered}
        {typeof result.value === 'number' && result.unit?.symbol ? ` ${result.unit.symbol}` : ''}
      </strong>
      {result.description && <p>{result.description}</p>}
    </article>
  );
}
