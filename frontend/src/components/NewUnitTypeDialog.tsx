import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input, Textarea } from './ui/form-controls';
import { FormField } from './ui/form-field';

function aliases(value: FormDataEntryValue | null): string[] {
  return String(value ?? '').split(',').map((item: string) => item.trim()).filter(Boolean);
}

export function NewUnitTypeDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.createUnitType({
        key: String(form.get('key')),
        name: String(form.get('name')),
        description: String(form.get('description') || '') || null,
        baseUnit: {
          key: String(form.get('baseKey')),
          name: String(form.get('baseName')),
          symbol: String(form.get('baseSymbol')),
          aliases: aliases(form.get('baseAliases'))
        }
      });
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not create unit type');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => setOpen(nextOpen)}>
      <DialogTrigger asChild><Button><Plus className="size-4" />New unit type</Button></DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>New unit type</DialogTitle>
            <DialogDescription>Define a canonical base unit. Every other unit converts back to this base.</DialogDescription>
          </DialogHeader>
          <FormField label="Type key" htmlFor="unit-type-key"><Input id="unit-type-key" name="key" placeholder="distance" pattern="[a-z][a-z0-9_-]*" required /></FormField>
          <FormField label="Type name" htmlFor="unit-type-name"><Input id="unit-type-name" name="name" placeholder="Distance" required /></FormField>
          <FormField label="Description" htmlFor="unit-type-description"><Textarea id="unit-type-description" name="description" rows={2} /></FormField>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="mb-3 font-semibold text-slate-100">Canonical base unit</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Unit key" htmlFor="base-key"><Input id="base-key" name="baseKey" placeholder="m" pattern="[a-z][a-z0-9_-]*" required /></FormField>
              <FormField label="Symbol" htmlFor="base-symbol"><Input id="base-symbol" name="baseSymbol" placeholder="m" required /></FormField>
            </div>
            <FormField label="Name" htmlFor="base-name" className="mt-4"><Input id="base-name" name="baseName" placeholder="Meter" required /></FormField>
            <FormField label="Aliases" htmlFor="base-aliases" className="mt-4" help="Comma-separated. The base always has scale 1 and offset 0."><Input id="base-aliases" name="baseAliases" placeholder="meter, meters, metre, metres" /></FormField>
          </div>
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
