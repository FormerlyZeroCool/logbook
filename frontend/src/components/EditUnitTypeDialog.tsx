import { Pencil } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

export function EditUnitTypeDialog({ unitType, onChanged }: { unitType: UnitTypeDefinition; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.updateUnitType(unitType.key, {
        name: String(form.get('name')),
        description: String(form.get('description') || '') || null
      });
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update unit type');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete unit type “${unitType.name}” and all of its unused units?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteUnitType(unitType.key);
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete unit type');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => setOpen(nextOpen)}>
      <DialogTrigger asChild><Button variant="secondary" size="sm"><Pencil className="size-3.5" />Edit type</Button></DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Manage {unitType.name}</DialogTitle>
            <DialogDescription>The key and canonical base unit are immutable.</DialogDescription>
          </DialogHeader>
          <FormField label="Key"><Input value={unitType.key} disabled /></FormField>
          <FormField label="Name" htmlFor="edit-unit-type-name"><Input id="edit-unit-type-name" name="name" defaultValue={unitType.name} required /></FormField>
          <FormField label="Description" htmlFor="edit-unit-type-description" help={`Used by ${unitType.eventTypeCount} event type(s).`}><Textarea id="edit-unit-type-description" name="description" rows={3} defaultValue={unitType.description ?? ''} /></FormField>
          {error && <p className="error-message">{error}</p>}
          <DialogFooter className="justify-between">
            <Button type="button" variant="destructive" size="sm" onClick={() => void remove()} disabled={busy || unitType.eventTypeCount > 0}>Delete type</Button>
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
