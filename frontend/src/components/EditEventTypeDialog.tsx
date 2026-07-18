import { Settings2 } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { EventTypeSummary, UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input, Select, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

export function EditEventTypeDialog({ eventType, unitTypes, onChanged, deleteRedirect = '/' }: {
  eventType: EventTypeSummary;
  unitTypes: UnitTypeDefinition[];
  onChanged: () => void;
  deleteRedirect?: string;
}) {
  const [open, setOpen] = useState(false);
  const [selectedUnitTypeKey, setSelectedUnitTypeKey] = useState(eventType.unitType?.key ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const selectedUnitType = useMemo(
    (): UnitTypeDefinition | null => unitTypes.find((unitType: UnitTypeDefinition) => unitType.key === selectedUnitTypeKey) ?? null,
    [selectedUnitTypeKey, unitTypes]
  );

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.updateEventType(eventType.key, {
        name: String(form.get('name')),
        description: String(form.get('description') || '') || null,
        unitTypeKey: selectedUnitTypeKey || null,
        defaultUnitKey: selectedUnitTypeKey ? String(form.get('defaultUnitKey')) : null,
        icon: String(form.get('icon') || '') || null,
        color: String(form.get('color') || '') || null,
        isActive: form.get('isActive') === 'on'
      });
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update event type');
    } finally {
      setBusy(false);
    }
  }

  async function deleteType(): Promise<void> {
    if (!window.confirm(`Delete the unused event type “${eventType.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteEventType(eventType.key);
      navigate(deleteRedirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete event type');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => {
      setSelectedUnitTypeKey(eventType.unitType?.key ?? '');
      setOpen(nextOpen);
    }}>
      <DialogTrigger asChild><Button variant="secondary"><Settings2 className="size-4" />Manage type</Button></DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Manage {eventType.name}</DialogTitle>
            <DialogDescription>The key is immutable so historical series references remain stable.</DialogDescription>
          </DialogHeader>
          <FormField label="Key"><Input value={eventType.key} disabled /></FormField>
          <FormField label="Name" htmlFor="edit-event-name"><Input id="edit-event-name" name="name" defaultValue={eventType.name} required /></FormField>
          <FormField label="Description" htmlFor="edit-event-description"><Textarea id="edit-event-description" name="description" rows={3} defaultValue={eventType.description ?? ''} /></FormField>
          <FormField label="Measurement type" htmlFor="edit-event-unit-type" help={eventType.numericEvents > 0 ? 'Locked after numeric data exists because changing it would reinterpret historical values.' : undefined}>
            <Select id="edit-event-unit-type" value={selectedUnitTypeKey} disabled={eventType.numericEvents > 0} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedUnitTypeKey(event.target.value)}>
              <option value="">No unit</option>
              {unitTypes.map((unitType: UnitTypeDefinition) => <option key={unitType.key} value={unitType.key}>{unitType.name}</option>)}
            </Select>
          </FormField>
          {selectedUnitType && (
            <FormField label="Default input and display unit" htmlFor="edit-event-default-unit" help={selectedUnitType.baseUnit ? `Storage remains in ${selectedUnitType.baseUnit.symbol}.` : undefined}>
              <Select
                id="edit-event-default-unit"
                name="defaultUnitKey"
                defaultValue={selectedUnitTypeKey === eventType.unitType?.key ? eventType.defaultUnit?.key : selectedUnitType.baseUnit?.key}
                key={`${selectedUnitType.key}-${eventType.defaultUnit?.key ?? ''}`}
                required
              >
                {selectedUnitType.units.map((unit: UnitDefinition) => (
                  <option key={unit.key} value={unit.key}>{unit.name} ({unit.symbol}){unit.isBase ? ' — canonical' : ''}</option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Icon" htmlFor="edit-event-icon"><Input id="edit-event-icon" name="icon" defaultValue={eventType.icon ?? ''} placeholder="mdi:water" /></FormField>
            <FormField label="Accent color" htmlFor="edit-event-color"><Input id="edit-event-color" name="color" type="color" defaultValue={eventType.color ?? '#60a5fa'} className="h-11 p-1" /></FormField>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-300">
            <input name="isActive" type="checkbox" defaultChecked={eventType.isActive} className="size-4 accent-blue-500" />
            Accept new events
          </label>
          {!eventType.isActive && <p className="archive-note">Archived types remain available for history and charts but reject new events.</p>}
          {error && <p className="error-message">{error}</p>}
          <DialogFooter className="justify-between">
            {eventType.totalEvents === 0 ? (
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => void deleteType()}>Delete type</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
