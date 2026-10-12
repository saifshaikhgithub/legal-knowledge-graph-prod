import { cn } from '../../lib/utils';
import { METRIC_LABEL, usageTone } from '../../lib/billing';
import type { BillingSummary, Metric } from '../../lib/api';

const ORDER: Metric[] = ['messages', 'uploads', 'briefs', 'cases'];

export const UsageMeters = ({ summary }: { summary: BillingSummary }) => {
  const pro = summary.plan === 'pro';
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {ORDER.map((m) => {
        const used = summary.usage[m];
        const limit = summary.limits[m];
        return (
          <div key={m}>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="text-foreground/85">{METRIC_LABEL[m]}{m === 'cases' ? '' : ' this month'}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {used.toLocaleString('en-IN')}{pro ? '' : ` / ${limit.toLocaleString('en-IN')}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn('h-full rounded-full transition-all', pro ? 'bg-success' : usageTone(used, limit))}
                style={{ width: `${pro ? Math.max(2, Math.min(100, (used / limit) * 100)) : Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
