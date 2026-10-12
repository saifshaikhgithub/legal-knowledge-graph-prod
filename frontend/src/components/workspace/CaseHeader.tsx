import { useEffect, useRef, useState } from 'react';
import {
  Clock3, Download, Eraser, FileText, Loader2, Menu, MessagesSquare, MoreHorizontal, Network, ShieldAlert, Trash2,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import type { Case, CasePriority, CaseStatus, GraphStats } from '../../lib/api';

export type Tab = 'investigate' | 'graph' | 'timeline' | 'brief' | 'evidence';

const TABS: { id: Tab; label: string; icon: typeof Network }[] = [
  { id: 'investigate', label: 'Investigate', icon: MessagesSquare },
  { id: 'graph', label: 'Evidence Board', icon: Network },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
  { id: 'brief', label: 'Case Brief', icon: ShieldAlert },
  { id: 'evidence', label: 'Evidence Locker', icon: FileText },
];

interface Props {
  caseItem: Case;
  stats: GraphStats | null;
  tab: Tab;
  onTab: (t: Tab) => void;
  onUpdate: (changes: Partial<Pick<Case, 'status' | 'priority' | 'title'>>) => void;
  onExport: () => Promise<void>;
  onClearGraph: () => void;
  onDelete: () => void;
  onOpenSidebar: () => void;
}

const selectClass =
  'h-7 cursor-pointer appearance-none rounded-md border bg-surface-2 bg-no-repeat px-2 pr-6 font-mono text-[10.5px] uppercase tracking-wider ' +
  'focus:border-primary/50 focus:outline-none';

// Inline so tailwind-merge can't confuse the arrow image with the background colour.
const selectArrow = {
  backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='3'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundSize: '10px',
  backgroundPosition: 'right 6px center',
};

export const CaseHeader = ({ caseItem, stats, tab, onTab, onUpdate, onExport, onClearGraph, onDelete, onOpenSidebar }: Props) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(caseItem.title);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTitle(caseItem.title), [caseItem.title]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const saveTitle = () => {
    setEditing(false);
    const t = title.trim();
    if (t && t !== caseItem.title) onUpdate({ title: t });
    else setTitle(caseItem.title);
  };

  const exportReport = async () => {
    setExporting(true);
    try { await onExport(); } finally { setExporting(false); }
  };

  const chips = stats ? [
    ['Entities', stats.entities],
    ['Links', stats.relations],
    ['Events', stats.events],
    ['Evidence', caseItem.evidence_count],
  ] as const : [];

  return (
    <header className="border-b bg-surface/50">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
        <Button variant="ghost" size="icon-sm" className="-ml-1 lg:hidden" onClick={onOpenSidebar} aria-label="Open cases">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge tone="primary" className="shrink-0">{caseItem.case_number}</Badge>
            <select
              className={selectClass}
              style={selectArrow}
              value={caseItem.status}
              onChange={(e) => onUpdate({ status: e.target.value as CaseStatus })}
              aria-label="Case status"
            >
              <option value="active">Active</option>
              <option value="cold">Cold</option>
              <option value="closed">Closed</option>
            </select>
            <select
              className={cn(selectClass, caseItem.priority === 'critical' && 'border-destructive/50 text-destructive')}
              style={selectArrow}
              value={caseItem.priority}
              onChange={(e) => onUpdate({ priority: e.target.value as CasePriority })}
              aria-label="Case priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setTitle(caseItem.title); setEditing(false); } }}
              className="mt-1 w-full max-w-xl rounded-md border border-primary/40 bg-transparent px-1.5 font-display text-xl font-semibold focus:outline-none"
            />
          ) : (
            <h1
              onDoubleClick={() => setEditing(true)}
              title="Double-click to rename"
              className="mt-1 truncate font-display text-xl font-semibold tracking-tight"
            >
              {caseItem.title}
            </h1>
          )}
        </div>

        <div className="hidden items-center gap-4 xl:flex">
          {chips.map(([label, value]) => (
            <div key={label} className="text-right">
              <div className="font-mono text-lg font-semibold leading-none tabular-nums">{value}</div>
              <div className="label-mono mt-1 !text-[9px]">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={exportReport} disabled={exporting}>
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Export file</span>
          </Button>
          <div className="relative" ref={menuRef}>
            <Button variant="ghost" size="icon-sm" onClick={() => setMenuOpen((o) => !o)} aria-label="Case actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-30 w-52 animate-fade-up rounded-xl border bg-popover p-1 shadow-2xl">
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-3"
                  onClick={() => { setMenuOpen(false); onClearGraph(); }}
                >
                  <Eraser className="h-4 w-4 text-muted-foreground" /> Reset evidence graph
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                >
                  <Trash2 className="h-4 w-4" /> Delete case
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="mt-2 flex gap-1 overflow-x-auto px-3 sm:px-5" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => onTab(t.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-[13px] font-medium transition-colors',
              tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className={cn('h-4 w-4', tab === t.id && 'text-primary')} />
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />}
          </button>
        ))}
      </nav>
    </header>
  );
};
