import { Pencil } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { buildLatestEventStartUpdate } from '../event-edit';
import { formatDateTime, toDateTimeLocal } from '../format';
import type { EventTypeSummary, LogEvent, UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Select, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

export function EditLatestEventDialog({ eventType, event, unitType, onChanged }: {
  eventType: EventTypeSummary;
  event: LogEvent;
  unitType: UnitTypeDefinition | null;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedUnitKey, setSelectedUnitKey] = useState(event.inputUnit?.key ?? event.defaultUnit?.key ?? eventType.defaultUnit?.key ?? '');
  const [startedAtLocal, setStartedAtLocal] = useState(toDateTimeLocal(new Date(event.startedAt)));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect((): void => {
    setSelectedUnitKey(event.inputUnit?.key ?? event.defaultUnit?.key ?? eventType.defaultUnit?.key ?? '');
    setStartedAtLocal(toDateTimeLocal(new Date(event.startedAt)));
  }, [event.defaultUnit?.key, event.inputUnit?.key, event.startedAt, eventType.defaultUnit?.key]);

  async function submit(formEvent: FormEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(formEvent.currentTarget);
    const rawValue = String(form.get('value') ?? '').trim();
    try {
      await api.updateEvent(event.id, {
        ...buildLatestEventStartUpdate(event, startedAtLocal),
        value: rawValue === '' ? null : Number(rawValue),
        ...(rawValue !== '' && selectedUnitKey ? { unitKey: selectedUnitKey } : {}),
        textValue: String(form.get('textValue') ?? '').trim() || null,
        note: String(form.get('note') ?? '').trim() || null
      });
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update the latest event');
    } finally {
      setBusy(false);
    }
  }

  const currentValue = event.inputValue ?? event.displayValue ?? event.canonicalValue;
  const selectedUnit = unitType?.units.find((unit: UnitDefinition) => unit.key === selectedUnitKey) ?? null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}><Pencil className="size-4" />Edit latest</Button>
      <DialogContent>
        <form className="space-y-4" onSubmit={(formEvent: FormEvent<HTMLFormElement>) => void submit(formEvent)}>
          <DialogHeader>
            <DialogTitle>Edit latest {eventType.name} event</DialogTitle>
            <DialogDescription>
              Update the start time, value, or notes for the event that currently starts {formatDateTime(event.startedAt)}.
              Point events keep their end equal to the new start; duration events keep their existing end.
            </DialogDescription>
          </DialogHeader>
          <FormField label={event.eventKind === 'point' ? 'Occurred at' : 'Start'} htmlFor="latest-event-start">
            <Input
              id="latest-event-start"
              type="datetime-local"
              value={startedAtLocal}
              onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => setStartedAtLocal(changeEvent.target.value)}
              required
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={`Value${selectedUnit ? ` (${selectedUnit.symbol})` : ''}`} htmlFor="latest-event-value">
              <Input id="latest-event-value" name="value" type="number" step="any" defaultValue={currentValue ?? ''} />
            </FormField>
            {unitType && (
              <FormField label="Input unit" htmlFor="latest-event-unit">
                <Select id="latest-event-unit" value={selectedUnitKey} onChange={(changeEvent: ChangeEvent<HTMLSelectElement>) => setSelectedUnitKey(changeEvent.target.value)} required>
                  {unitType.units.map((unit: UnitDefinition) => <option key={unit.key} value={unit.key}>{unit.name} ({unit.symbol})</option>)}
                </Select>
              </FormField>
            )}
          </div>
          <FormField label="Text value" htmlFor="latest-event-text"><Input id="latest-event-text" name="textValue" defaultValue={event.textValue ?? ''} /></FormField>
          <FormField label="Note" htmlFor="latest-event-note"><Textarea id="latest-event-note" name="note" rows={4} defaultValue={event.note ?? ''} /></FormField>
          {error && <p className="error-message">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
