import { sdkManifest } from '@logbook/analysis-sdk';

export function SdkReferenceDrawer() {
  return <details className="analysis-panel">
    <summary>SDK reference</summary>
    <p>Constructors: {sdkManifest.constructors.join(', ')}</p>
    <p><strong>Mapping points:</strong> <code>{'event.values().map((value, point) => point.withValue((value ?? 0) * 2))'}</code></p><p><strong>Mapping values:</strong> <code>{'event.values().mapValues((value) => value * 2)'}</code></p>
    <p><strong>Reusable functions:</strong> use <code>udf.mappers</code>, <code>udf.filters</code>, <code>udf.reducers</code>, or <code>udf.window_transforms</code>. Additional advanced kinds are exposed under <code>udf.map_filters</code> and <code>udf.series_transforms</code>.</p>
    <ul>{sdkManifest.operations.map((operation) => <li key={`${operation.inputType}.${operation.methodName}`}><code>{operation.inputType}.{operation.methodName}()</code><span>{operation.description}</span></li>)}</ul>
  </details>;
}
