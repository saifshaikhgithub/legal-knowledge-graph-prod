import * as React from 'react';
import { cn } from '../../lib/utils';

export type Tone = 'neutral' | 'primary' | 'ai' | 'danger' | 'success' | 'warning';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted-foreground border-border',
  primary: 'bg-primary/10 text-primary border-primary/25',
  ai: 'bg-ai/10 text-ai border-ai/25',
  danger: 'bg-destructive/10 text-destructive border-destructive/25',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-orange-500/10 text-orange-500 border-orange-500/25',
};

export const Badge = ({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider',
      tones[tone],
      className,
    )}
    {...props}
  />
);
