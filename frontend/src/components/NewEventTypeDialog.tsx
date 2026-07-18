import { Plus } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import type { UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input, Select, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

export function NewEventTypeDialog({ unitTypes, onCreated }: { unitTypes: UnitTypeDefinition[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedUnitTypeKey, setSelectedUnitTypeKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      await api.createEventType({
        key: String(form.get('key')),
        name: String(form.get('name')),
        description: String(form.get('description') || '') || null,
        unitTypeKey: selectedUnitTypeKey || null,
        defaultUnitKey: selectedUnitTypeKey ? String(form.get('defaultUnitKey')) : null,
        color: String(form.get('color') || '') || null
      });
      setOpen(false);
      setSelectedUnitTypeKey('');
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create event type');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => setOpen(nextOpen)}>
      <DialogTrigger asChild><Button><Plus className="size-4" />New event type</Button></DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>New event type</DialogTitle>
            <DialogDescription>Define the managed series before events can be logged against it.</DialogDescription>
          </DialogHeader>
          <FormField label="Key" htmlFor="event-type-key" help="A stable lowercase slug such as water or dog_walk.">
            <Input id="event-type-key" name="key" placeholder="water" pattern="[a-z][a-z0-9_-]*" required />
          </FormField>
          <FormField label="Name" htmlFor="event-type-name"><Input id="event-type-name" name="name" placeholder="Water" required /></FormField>
          <FormField label="Description" htmlFor="event-type-description"><Textarea id="event-type-description" name="description" rows={3} /></FormField>
          <FormField label="Measurement type" htmlFor="event-unit-type">
            <Select id="event-unit-type" value={selectedUnitTypeKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedUnitTypeKey(event.target.value)}>
              <option value="">No unit</option>
              {unitTypes.map((unitType: UnitTypeDefinition) => <option key={unitType.key} value={unitType.key}>{unitType.name}</option>)}
            </Select>
          </FormField>
          {selectedUnitType && (
            <FormField label="Default input and display unit" htmlFor="event-default-unit" help={selectedUnitType.baseUnit ? `Canonical storage remains in ${selectedUnitType.baseUnit.symbol}.` : undefined}>
              <Select id="event-default-unit" name="defaultUnitKey" defaultValue={selectedUnitType.baseUnit?.key ?? selectedUnitType.units[0]?.key} key={selectedUnitType.key} required>
                {selectedUnitType.units.map((unit: UnitDefinition) => (
                  <option key={unit.key} value={unit.key}>{unit.name} ({unit.symbol}){unit.isBase ? ' — canonical' : ''}</option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label="Accent color" htmlFor="event-color"><Input id="event-color" name="color" type="color" defaultValue="#60a5fa" className="h-11 p-1" /></FormField>
          {error && <p className="error-message">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
