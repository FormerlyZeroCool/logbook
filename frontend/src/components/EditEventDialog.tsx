import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { buildEventUpdateRequest } from '../event-edit';
import { toDateTimeLocal } from '../format';
import type { EventTypeSummary, LogEvent, UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Select, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

export function EditEventDialog({
  eventType,
  event,
  unitType,
  open,
  onOpenChange,
  onChanged
}: {
  eventType: EventTypeSummary;
  event: LogEvent | null;
  unitType: UnitTypeDefinition | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [selectedUnitKey, setSelectedUnitKey] = useState('');
  const [startedAtLocal, setStartedAtLocal] = useState('');
  const [endedAtLocal, setEndedAtLocal] = useState('');
  const [ongoing, setOngoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect((): void => {
    if (!event) return;
    setSelectedUnitKey(event.inputUnit?.key ?? event.defaultUnit?.key ?? eventType.defaultUnit?.key ?? '');
    setStartedAtLocal(toDateTimeLocal(new Date(event.startedAt)));
    setEndedAtLocal(event.endedAt ? toDateTimeLocal(new Date(event.endedAt)) : '');
    setOngoing(event.eventKind === 'duration' && event.endedAt === null);
    setError(null);
  }, [event, eventType.defaultUnit?.key]);

  async function submit(formEvent: FormEvent<HTMLFormElement>): Promise<void> {
    formEvent.preventDefault();
    if (!event) return;

    setBusy(true);
    setError(null);
    const form = new FormData(formEvent.currentTarget);

    try {
      await api.updateEvent(event.id, buildEventUpdateRequest({
        eventKind: event.eventKind,
        startedAtLocal,
        endedAtLocal,
        ongoing,
        valueText: String(form.get('value') ?? ''),
        unitKey: selectedUnitKey,
        textValue: String(form.get('textValue') ?? ''),
        note: String(form.get('note') ?? '')
      }));
      onOpenChange(false);
      onChanged();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not update event');
    } finally {
      setBusy(false);
    }
  }

  const currentValue = event?.inputValue ?? event?.displayValue ?? event?.canonicalValue ?? null;
  const selectedUnit = unitType?.units.find((unit: UnitDefinition) => unit.key === selectedUnitKey) ?? null;
  const isPoint = event?.eventKind === 'point';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {event && (
          <form className="space-y-4" onSubmit={(formEvent: FormEvent<HTMLFormElement>) => void submit(formEvent)}>
            <DialogHeader>
              <DialogTitle>Edit {eventType.name} event</DialogTitle>
              <DialogDescription>
                Update this event’s value, timestamps, text, or note. Point events always keep identical start and end times.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={`Value${selectedUnit ? ` (${selectedUnit.symbol})` : ''}`} htmlFor="edit-event-value">
                <Input id="edit-event-value" name="value" type="number" step="any" defaultValue={currentValue ?? ''} />
              </FormField>
              {unitType && (
                <FormField label="Input unit" htmlFor="edit-event-unit">
                  <Select
                    id="edit-event-unit"
                    value={selectedUnitKey}
                    onChange={(changeEvent: ChangeEvent<HTMLSelectElement>) => setSelectedUnitKey(changeEvent.target.value)}
                    required
                  >
                    {unitType.units.map((unit: UnitDefinition) => (
                      <option key={unit.key} value={unit.key}>{unit.name} ({unit.symbol})</option>
                    ))}
                  </Select>
                </FormField>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={isPoint ? 'Occurred at' : 'Start'} htmlFor="edit-event-start">
                <Input
                  id="edit-event-start"
                  type="datetime-local"
                  value={startedAtLocal}
                  onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => {
                    setStartedAtLocal(changeEvent.target.value);
                    if (isPoint) setEndedAtLocal(changeEvent.target.value);
                  }}
                  required
                />
              </FormField>
              <FormField label={isPoint ? 'End (same as start)' : 'End'} htmlFor="edit-event-end">
                <Input
                  id="edit-event-end"
                  type="datetime-local"
                  value={isPoint ? startedAtLocal : endedAtLocal}
                  onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => setEndedAtLocal(changeEvent.target.value)}
                  disabled={isPoint || ongoing}
                  required={!isPoint && !ongoing}
                />
              </FormField>
            </div>

            {!isPoint && (
              <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={ongoing}
                  onChange={(changeEvent: ChangeEvent<HTMLInputElement>) => setOngoing(changeEvent.target.checked)}
                  className="size-4 accent-blue-500"
                />
                This event is still ongoing
              </label>
            )}

            <FormField label="Text value" htmlFor="edit-event-text">
              <Input id="edit-event-text" name="textValue" defaultValue={event.textValue ?? ''} />
            </FormField>
            <FormField label="Note" htmlFor="edit-event-note">
              <Textarea id="edit-event-note" name="note" rows={4} defaultValue={event.note ?? ''} />
            </FormField>

            {error && <p className="error-message">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
