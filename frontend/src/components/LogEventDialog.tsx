import { CircleDot, Timer } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { api } from '../api';
import { localInputToIso, toDateTimeLocal } from '../format';
import type { EventTypeSummary, UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Select, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

type Action = 'log' | 'start';

export function LogEventDialog({ eventType, unitType, onCreated }: {
  eventType: EventTypeSummary;
  unitType: UnitTypeDefinition | null;
  onCreated: () => void;
}) {
  const [action, setAction] = useState<Action | null>(null);
  const [completed, setCompleted] = useState(false);
  const [selectedUnitKey, setSelectedUnitKey] = useState(eventType.defaultUnit?.key ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect((): void => setSelectedUnitKey(eventType.defaultUnit?.key ?? ''), [eventType.defaultUnit?.key]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const rawValue = String(form.get('value') ?? '').trim();
    const values = {
      value: rawValue ? Number(rawValue) : null,
      ...(rawValue && selectedUnitKey ? { unitKey: selectedUnitKey } : {}),
      textValue: String(form.get('textValue') || '') || null,
      note: String(form.get('note') || '') || null
    };

    try {
      if (action === 'log') {
        await api.logPointEvent({
          eventTypeId: eventType.id,
          occurredAt: localInputToIso(String(form.get('occurredAt'))),
          ...values
        });
      } else {
        const started = await api.startDurationEvent({
          eventTypeId: eventType.id,
          startedAt: localInputToIso(String(form.get('startedAt'))),
          ...values
        });
        if (completed) {
          await api.endEvent({
            eventId: started.id,
            endedAt: localInputToIso(String(form.get('endedAt')))
          });
        }
      }
      setAction(null);
      setCompleted(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save event');
    } finally {
      setBusy(false);
    }
  }

  const selectedUnit = unitType?.units.find((unit: UnitDefinition) => unit.key === selectedUnitKey) ?? null;
  const isLog = action === 'log';

  return (
    <>
      <Button onClick={() => setAction('log')}><CircleDot className="size-4" />Log point</Button>
      <Button variant="secondary" onClick={() => setAction('start')}><Timer className="size-4" />Start duration</Button>
      <Dialog open={action !== null} onOpenChange={(open: boolean) => { if (!open) setAction(null); }}>
        <DialogContent>
          <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{isLog ? 'Log' : 'Start'} {eventType.name}</DialogTitle>
              <DialogDescription>
                {isLog
                  ? 'Creates a point event with identical start and end timestamps and a duration of zero.'
                  : 'Creates an ongoing duration event, or records a completed interval using start and end.'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={`Value${selectedUnit ? ` (${selectedUnit.symbol})` : ''}`} htmlFor="event-value">
                <Input id="event-value" name="value" type="number" step="any" />
              </FormField>
              {unitType && (
                <FormField label="Input unit" htmlFor="event-input-unit">
                  <Select id="event-input-unit" value={selectedUnitKey} onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedUnitKey(event.target.value)} required>
                    {unitType.units.map((unit: UnitDefinition) => <option key={unit.key} value={unit.key}>{unit.name} ({unit.symbol})</option>)}
                  </Select>
                </FormField>
              )}
            </div>
            {unitType?.baseUnit && selectedUnit && selectedUnit.key !== unitType.baseUnit.key && (
              <p className="rounded-lg border border-blue-900/40 bg-blue-950/30 px-3 py-2 text-xs text-blue-200">The API converts this value to {unitType.baseUnit.symbol} before storing it.</p>
            )}
            <FormField label="Text value" htmlFor="event-text"><Input id="event-text" name="textValue" /></FormField>
            {isLog ? (
              <FormField label="When" htmlFor="event-occurred-at"><Input id="event-occurred-at" name="occurredAt" type="datetime-local" defaultValue={toDateTimeLocal()} required /></FormField>
            ) : (
              <>
                <FormField label="Start" htmlFor="event-started-at"><Input id="event-started-at" name="startedAt" type="datetime-local" defaultValue={toDateTimeLocal()} required /></FormField>
                <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-sm text-slate-300">
                  <input type="checkbox" checked={completed} onChange={(event: ChangeEvent<HTMLInputElement>) => setCompleted(event.target.checked)} className="size-4 accent-blue-500" />
                  Enter an already completed duration
                </label>
                {completed && <FormField label="End" htmlFor="event-ended-at"><Input id="event-ended-at" name="endedAt" type="datetime-local" defaultValue={toDateTimeLocal()} required /></FormField>}
              </>
            )}
            <FormField label="Note" htmlFor="event-note"><Textarea id="event-note" name="note" rows={3} /></FormField>
            {error && <p className="error-message">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : isLog ? 'Log point' : completed ? 'Save duration' : 'Start duration'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
