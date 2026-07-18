import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentPropsWithoutRef, ElementRef, ForwardedRef, HTMLAttributes } from 'react';
import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentElement = ElementRef<typeof DialogPrimitive.Content>;
type DialogContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;

function DialogContentRender(
  { className, children, ...props }: DialogContentProps,
  ref: ForwardedRef<DialogContentElement>
) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn('fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl focus:outline-none', className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close">
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const DialogContent = forwardRef<DialogContentElement, DialogContentProps>(DialogContentRender);
DialogContent.displayName = 'DialogContent';

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5 space-y-1.5', className)} {...props} />;
}

type DialogTitleElement = ElementRef<typeof DialogPrimitive.Title>;
type DialogTitleProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;

function DialogTitleRender(
  { className, ...props }: DialogTitleProps,
  ref: ForwardedRef<DialogTitleElement>
) {
  return <DialogPrimitive.Title ref={ref} className={cn('text-xl font-semibold tracking-tight', className)} {...props} />;
}

export const DialogTitle = forwardRef<DialogTitleElement, DialogTitleProps>(DialogTitleRender);
DialogTitle.displayName = 'DialogTitle';

type DialogDescriptionElement = ElementRef<typeof DialogPrimitive.Description>;
type DialogDescriptionProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Description>;

function DialogDescriptionRender(
  { className, ...props }: DialogDescriptionProps,
  ref: ForwardedRef<DialogDescriptionElement>
) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-slate-400', className)} {...props} />;
}

export const DialogDescription = forwardRef<DialogDescriptionElement, DialogDescriptionProps>(DialogDescriptionRender);
DialogDescription.displayName = 'DialogDescription';

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex items-center justify-end gap-2', className)} {...props} />;
}
