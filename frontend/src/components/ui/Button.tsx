import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ai' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
}

const variants = {
  default: 'bg-primary text-primary-foreground hover:brightness-110 shadow-[0_0_0_1px_hsl(var(--primary)/.4),0_6px_20px_-6px_hsl(var(--primary)/.6)]',
  ai: 'bg-ai text-ai-foreground hover:brightness-110 shadow-[0_0_0_1px_hsl(var(--ai)/.4),0_6px_20px_-6px_hsl(var(--ai)/.6)]',
  destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
  outline: 'border border-border bg-surface/60 hover:bg-surface-3 hover:border-foreground/20',
  secondary: 'bg-surface-3 text-foreground hover:bg-surface-3/70',
  ghost: 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

const sizes = {
  default: 'h-10 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button };
