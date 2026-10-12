import { BRAND } from '../../lib/brand';
import { cn } from '../../lib/utils';

export const LogoMark = ({ className }: { className?: string }) => (
  <div className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10', className)}>
    <svg viewBox="0 0 32 32" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="16" cy="16" r="8.5" />
      <circle cx="16" cy="16" r="2.6" fill="currentColor" stroke="none" />
      <path d="M16 3v5M16 24v5M3 16h5M24 16h5" />
    </svg>
  </div>
);

export const Logo = ({ className, compact }: { className?: string; compact?: boolean }) => (
  <div className={cn('flex items-center gap-2.5', className)}>
    <LogoMark />
    {!compact && (
      <div className="leading-none">
        <div className="font-display text-[17px] font-bold tracking-tight">{BRAND.name}</div>
        <div className="label-mono mt-1 !text-[9px]">{BRAND.tagline}</div>
      </div>
    )}
  </div>
);
