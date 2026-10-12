import * as React from 'react';
import { cn } from '../../lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-xl border bg-card text-card-foreground', className)} {...props} />
));
Card.displayName = 'Card';

const SectionTitle = ({ icon, children, action, className }: {
  icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode; className?: string;
}) => (
  <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
    <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {icon && <span className="text-primary">{icon}</span>}
      {children}
    </h3>
    {action}
  </div>
);

export { Card, SectionTitle };
