import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { UnitDefinition, UnitTypeDefinition } from '../types';
import { NewUnitTypeDialog } from '../components/NewUnitTypeDialog';
import { EditUnitTypeDialog } from '../components/EditUnitTypeDialog';
import { UnitDialog } from '../components/UnitDialog';

export function UnitsPage() {
  const queryClient = useQueryClient();
  const query = useQuery<UnitTypeDefinition[]>({
    queryKey: ['unit-types'],
    queryFn: api.listUnitTypes
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['unit-types'] });
    void queryClient.invalidateQueries({ queryKey: ['event-types'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  return <>
    <div className="page-heading">
      <div>
        <p className="eyebrow">Measurement catalog</p>
        <h1>Units</h1>
        <p>Define canonical storage units and conversion rules enforced by the backend.</p>
      </div>
      <NewUnitTypeDialog onCreated={refresh} />
    </div>
    {query.isPending && <p className="loading-state">Loading…</p>}
    {query.error && <div className="error-panel"><strong>Could not load units</strong><span>{query.error.message}</span><button onClick={() => void query.refetch()}>Retry</button></div>}
    <div className="catalog-stack">
      {query.data?.map((unitType: UnitTypeDefinition) => <section className="table-card catalog-card" key={unitType.key}>
        <div className="section-heading catalog-heading">
          <div>
            <h2>{unitType.name}</h2>
            <p><code>{unitType.key}</code> · base {unitType.baseUnit?.symbol ?? 'missing'} · {unitType.eventTypeCount} event type(s)</p>
          </div>
          <div className="row-actions">
            <EditUnitTypeDialog unitType={unitType} onChanged={refresh} />
            <UnitDialog unitType={unitType} onChanged={refresh} />
          </div>
        </div>
        {unitType.description && <p className="catalog-description">{unitType.description}</p>}
        <div className="responsive-table">
          <table>
            <thead><tr><th>Unit</th><th>Key</th><th>Conversion to base</th><th>Usage</th><th></th></tr></thead>
            <tbody>
              {unitType.units.map((unit: UnitDefinition) => <tr key={unit.key}>
                <td><strong>{unit.name}</strong> <span className="muted">({unit.symbol})</span>{unit.isBase && <span className="status-pill mode-pill ml-2">base</span>}</td>
                <td><code>{unit.key}</code></td>
                <td><code>x × {unit.scaleToBase}{unit.offsetToBase ? ` ${unit.offsetToBase >= 0 ? '+' : '-'} ${Math.abs(unit.offsetToBase)}` : ''}</code></td>
                <td>{unit.eventCount} events · {unit.defaultEventTypeCount} defaults</td>
                <td><UnitDialog unitType={unitType} unit={unit} onChanged={refresh} /></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>)}
    </div>
  </>;
}
