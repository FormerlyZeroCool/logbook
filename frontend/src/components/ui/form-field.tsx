import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Label } from './form-controls';

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  help?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function FormField({ label, htmlFor, help, className, children }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm font-medium text-slate-300">{label}</Label>
      {children}
      {help && <p className="text-xs leading-relaxed text-slate-500">{help}</p>}
    </div>
  );
}
