import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, Crown, FolderSearch, LogOut, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { cn } from '../../lib/utils';
import { timeAgo } from '../../lib/entity';
import { useAuth } from '../../lib/AuthContext';
import { useTheme } from '../../lib/ThemeContext';
import { useBilling } from '../../lib/BillingContext';
import { usageTone } from '../../lib/billing';
import type { Case, CaseStatus } from '../../lib/api';

const STATUS_DOT: Record<string, string> = {
  active: 'bg-primary shadow-[0_0_8px_hsl(var(--primary))]',
  cold: 'bg-ai',
  closed: 'bg-success',
};

const PRIORITY_BAR: Record<string, string> = {
  critical: 'bg-destructive',
  high: 'bg-orange-500',
  medium: 'bg-primary/60',
  low: 'bg-muted-foreground/30',
};

interface Props {
  cases: Case[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  open: boolean;
  onClose: () => void;
}

export const CaseSidebar = ({ cases, loading, selectedId, onSelect, onNew, open, onClose }: Props) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CaseStatus | 'all'>('all');
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { summary, openUpgrade } = useBilling();

  const visible = useMemo(() => cases.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || c.title.toLowerCase().includes(q) || c.case_number.toLowerCase().includes(q);
  }), [cases, query, filter]);

  const initials = (user?.full_name || user?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('');

  return (
    <>
      <div
        className={cn('fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[290px] flex-col border-r bg-surface transition-transform duration-300 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <Link to="/"><Logo /></Link>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" onClick={onClose} aria-label="Close sidebar">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 pb-3">
          <Button onClick={onNew} className="w-full justify-start">
            <Plus className="h-4 w-4" /> Open new case
          </Button>
        </div>

        <div className="space-y-2 px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cases…"
              className="h-9 w-full rounded-lg border bg-surface-2/70 pl-8 pr-3 text-sm placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
            {(['all', 'active', 'cold', 'closed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'flex-1 rounded-md py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
                  filter === f ? 'bg-surface-3 text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="label-mono px-5 pb-2">Case files · {visible.length}</div>
        <div className="flex-1 space-y-1 overflow-y-auto px-2.5 pb-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="mx-1 h-[62px] animate-pulse rounded-lg bg-surface-2" />)
          ) : visible.length === 0 ? (
            <div className="mx-2 mt-4 rounded-xl border border-dashed p-5 text-center">
              <FolderSearch className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">{cases.length ? 'No cases match.' : 'No cases yet. Open one to begin.'}</p>
            </div>
          ) : (
            visible.map((c) => (
              <button
                key={c.id}
                onClick={() => { onSelect(c.id); onClose(); }}
                className={cn(
                  'group relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition-all',
                  selectedId === c.id
                    ? 'border-primary/40 bg-primary/[0.07]'
                    : 'border-transparent hover:border-border hover:bg-surface-2',
                )}
              >
                <span className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r-full', PRIORITY_BAR[c.priority] || PRIORITY_BAR.medium)} />
                <div className="flex items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[c.status] || STATUS_DOT.active)} />
                  <span className="truncate text-[13.5px] font-medium">{c.title}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 pl-3.5 font-mono text-[10.5px] text-muted-foreground">
                  <span>{c.case_number}</span>
                  <span>{c.entity_count} ent · {timeAgo(c.updated_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {summary && (summary.plan === 'pro' ? (
          <Link to="/app/billing" className="mx-3 mb-3 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2.5 transition-colors hover:bg-primary/10">
            <Crown className="h-4 w-4 text-primary" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[13px] font-semibold">{summary.complimentary ? 'Pro · complimentary' : 'Pro plan'}</div>
              <div className="text-[11px] text-muted-foreground">Unlimited investigations</div>
            </div>
          </Link>
        ) : (
          <div className="mx-3 mb-3 rounded-xl border bg-surface-2/60 p-3">
            <div className="flex items-baseline justify-between">
              <span className="label-mono">Free plan</span>
              <span className="font-mono text-[11px] text-muted-foreground">{summary.usage.messages}/{summary.limits.messages} AI questions</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div className={cn('h-full rounded-full transition-all', usageTone(summary.usage.messages, summary.limits.messages))}
                style={{ width: `${Math.min(100, (summary.usage.messages / Math.max(1, summary.limits.messages)) * 100)}%` }} />
            </div>
            <Button size="sm" className="mt-3 w-full" onClick={() => openUpgrade()}>
              <Crown className="h-3.5 w-3.5" /> Upgrade to Pro
            </Button>
          </div>
        ))}

        <div className="flex items-center gap-2.5 border-t p-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-3 font-mono text-xs font-semibold">{initials}</div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-medium">{user?.full_name || user?.email}</div>
            <div className="truncate text-[11px] text-muted-foreground">{user?.organization || user?.email}</div>
          </div>
          <Link to="/app/billing" title="Plan & billing" aria-label="Plan and billing"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground">
            <CreditCard className="h-4 w-4" />
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>
    </>
  );
};
