import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25',
      success: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/25',
      muted: 'bg-slate-700/70 text-slate-300 ring-1 ring-inset ring-slate-600/50',
      warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/25'
    }
  },
  defaultVariants: { variant: 'default' }
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
