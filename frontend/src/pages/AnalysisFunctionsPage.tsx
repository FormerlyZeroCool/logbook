import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { AnalysisFunctionKind } from '../types';

const FUNCTION_TEMPLATES: readonly { value: AnalysisFunctionKind; label: string; description: string }[] = [
  { value: 'point-map', label: 'Mapper', description: 'Value + point → NumericPoint' },
  { value: 'point-filter', label: 'Filter', description: 'Point/value → boolean' },
  { value: 'reducer', label: 'Reducer', description: 'Series values → number or string' },
  { value: 'window-transform', label: 'Window transform', description: 'Window + size → NumericPoint' },
  { value: 'event-filter', label: 'Event filter', description: 'EventRecord → boolean' },
  { value: 'map-filter', label: 'Map/filter', description: 'Point/value → NumericPoint | null' },
  { value: 'series-transform', label: 'Series transform', description: 'NumericSeries → AnalysisResult' },
];

function normalizeFunctionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

export function AnalysisFunctionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const functions = useQuery({ queryKey: ['analysis-functions'], queryFn: api.listAnalysisFunctions });
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [templateKind, setTemplateKind] = useState<AnalysisFunctionKind>('point-map');
  const [factoryTemplate, setFactoryTemplate] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createAnalysisFunction({ name, functionKey: key, functionKind: templateKind }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: ['analysis-functions'] });
      navigate(`/analysis-functions/${item.id}${factoryTemplate ? '?template=factory' : ''}`);
    },
  });

  return <div className="analysis-list-page">
    <header>
      <div>
        <h1>Analysis functions</h1>
        <p>Choose a starting template. The signature you save—not the template button—determines where the function appears under <code>udf</code>.</p>
      </div>
    </header>
    <section className="analysis-panel">
      <h2>Create function</h2>
      <form className="analysis-create-function" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
        <div className="analysis-create-row">
          <input
            placeholder="Name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!key) setKey(normalizeFunctionKey(event.target.value));
            }}
            required
          />
          <input
            placeholder="stable_key"
            value={key}
            onChange={(event) => setKey(normalizeFunctionKey(event.target.value))}
            pattern="[a-z][a-z0-9_]{0,63}"
            title="Use lowercase letters, numbers, and underscores only."
            required
          />
          <button type="submit" disabled={create.isPending}>Create from selected template</button>
        </div>
        <label className="analysis-factory-template-toggle">
          <input type="checkbox" checked={factoryTemplate} onChange={(event) => setFactoryTemplate(event.target.checked)} />
          Start with typed factory parameters
        </label>
        <div className="analysis-template-buttons" role="radiogroup" aria-label="UDF template">
          {FUNCTION_TEMPLATES.map((template) => <button
            key={template.value}
            type="button"
            role="radio"
            aria-checked={templateKind === template.value}
            className={templateKind === template.value ? 'active' : ''}
            onClick={() => setTemplateKind(template.value)}
          ><strong>{template.label}</strong><small>{template.description}</small></button>)}
        </div>
      </form>
    </section>
    <section className="analysis-function-grid">
      {(functions.data ?? []).map((item) => <Link className="analysis-function-card" key={item.id} to={`/analysis-functions/${item.id}`}>
        <header><strong>{item.name}</strong>{item.is_system && <span>System</span>}</header>
        <code>{item.function_key}</code>
        <p>{item.description ?? 'No description'}</p>
        <footer><span>{item.function_kind}</span><span>{item.published_revision_id ? 'Published' : item.draft_revision_id ? item.draft_validation_status : 'No revision'}</span></footer>
      </Link>)}
    </section>
  </div>;
}
