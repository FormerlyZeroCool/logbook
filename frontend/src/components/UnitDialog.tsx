import { Plus, Settings2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import type { UnitDefinition, UnitTypeDefinition } from '../types';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Input } from './ui/form-controls';
import { FormField } from './ui/form-field';

function parseAliases(value: FormDataEntryValue | null): string[] {
  return String(value ?? '').split(',').map((item: string) => item.trim()).filter(Boolean);
}

export function UnitDialog({ unitType, unit, onChanged }: {
  unitType: UnitTypeDefinition;
  unit?: UnitDefinition;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(unit);
  const conversionLocked = Boolean(unit?.isBase || (unit?.eventCount ?? 0) > 0);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      if (unit) {
        await api.updateUnit(unitType.key, unit.key, {
          name: String(form.get('name')),
          symbol: String(form.get('symbol')),
          ...(conversionLocked ? {} : {
            scaleToBase: Number(form.get('scaleToBase')),
            offsetToBase: Number(form.get('offsetToBase'))
          }),
          aliases: parseAliases(form.get('aliases'))
        });
      } else {
        await api.createUnit(unitType.key, {
          key: String(form.get('key')),
          name: String(form.get('name')),
          symbol: String(form.get('symbol')),
          scaleToBase: Number(form.get('scaleToBase')),
          offsetToBase: Number(form.get('offsetToBase')),
          aliases: parseAliases(form.get('aliases'))
        });
      }
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save unit');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!unit || !window.confirm(`Delete unit “${unit.name}”?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteUnit(unitType.key, unit.key);
      setOpen(false);
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not delete unit');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen: boolean) => setOpen(nextOpen)}>
      <DialogTrigger asChild>
        <Button variant={editing ? 'secondary' : 'default'} size={editing ? 'sm' : 'default'}>
          {editing ? <Settings2 className="size-3.5" /> : <Plus className="size-4" />}
          {editing ? 'Edit' : 'Add unit'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${unit!.name}` : `Add a ${unitType.name.toLowerCase()} unit`}</DialogTitle>
            <DialogDescription>Conversion formula: base value = input value × scale + offset.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Key" htmlFor="unit-key"><Input id="unit-key" name="key" defaultValue={unit?.key ?? ''} disabled={editing} pattern="[a-z][a-z0-9_-]*" required /></FormField>
            <FormField label="Symbol" htmlFor="unit-symbol"><Input id="unit-symbol" name="symbol" defaultValue={unit?.symbol ?? ''} required /></FormField>
          </div>
          <FormField label="Name" htmlFor="unit-name"><Input id="unit-name" name="name" defaultValue={unit?.name ?? ''} required /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={`Scale to ${unitType.baseUnit?.symbol ?? 'base'}`} htmlFor="unit-scale">
              <Input id="unit-scale" name="scaleToBase" type="number" step="any" min="0" defaultValue={unit?.scaleToBase ?? 1} disabled={conversionLocked} required />
            </FormField>
            <FormField label={`Offset to ${unitType.baseUnit?.symbol ?? 'base'}`} htmlFor="unit-offset">
              <Input id="unit-offset" name="offsetToBase" type="number" step="any" defaultValue={unit?.offsetToBase ?? 0} disabled={conversionLocked} required />
            </FormField>
          </div>
          {conversionLocked && <p className="rounded-lg border border-amber-900/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">Conversion is locked because this is the base unit or it has already been used by recorded events.</p>}
          <FormField label="Aliases" htmlFor="unit-aliases"><Input id="unit-aliases" name="aliases" defaultValue={unit?.aliases.join(', ') ?? ''} /></FormField>
          {error && <p className="error-message">{error}</p>}
          <DialogFooter className="justify-between">
            {unit ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => void remove()} disabled={busy || unit.isBase || unit.eventCount > 0 || unit.defaultEventTypeCount > 0}>Delete</Button>
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
