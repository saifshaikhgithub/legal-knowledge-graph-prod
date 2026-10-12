import * as React from 'react';
import { cn } from '../../lib/utils';

const fieldClass =
  'flex w-full rounded-lg border border-input bg-surface-2/70 px-3 text-sm text-foreground placeholder:text-muted-foreground/70 ' +
  'transition-colors focus-visible:outline-none focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldClass, 'h-10', className)} {...props} />,
);
Input.displayName = 'Input';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldClass, 'py-2.5', className)} {...props} />,
);
Textarea.displayName = 'Textarea';

const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('label-mono mb-1.5 block', className)} {...props} />
);

export { Input, Textarea, Label };
