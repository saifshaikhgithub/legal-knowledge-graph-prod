import { useState } from 'react';
import type { FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Label, Textarea } from '../ui/Input';
import { cn } from '../../lib/utils';
import { ApiError, type CasePriority } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; description?: string; priority: CasePriority }) => Promise<void>;
}

const PRIORITIES: { id: CasePriority; label: string; cls: string }[] = [
  { id: 'low', label: 'Low', cls: 'data-[on=true]:border-muted-foreground/50 data-[on=true]:bg-surface-3' },
  { id: 'medium', label: 'Medium', cls: 'data-[on=true]:border-primary/60 data-[on=true]:bg-primary/10 data-[on=true]:text-primary' },
  { id: 'high', label: 'High', cls: 'data-[on=true]:border-orange-500/60 data-[on=true]:bg-orange-500/10 data-[on=true]:text-orange-500' },
  { id: 'critical', label: 'Critical', cls: 'data-[on=true]:border-destructive/60 data-[on=true]:bg-destructive/10 data-[on=true]:text-destructive' },
];

export const NewCaseModal = ({ open, onClose, onCreate }: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CasePriority>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({ title: title.trim(), description: description.trim() || undefined, priority });
      setTitle('');
      setDescription('');
      setPriority('medium');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) onClose(); // the upgrade dialog takes over
      else setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Open a new case">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        <div>
          <Label htmlFor="case-title">Case title</Label>
          <Input id="case-title" autoFocus placeholder="e.g. Riverside Warehouse Homicide" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="case-desc">Initial summary <span className="normal-case tracking-normal opacity-70">(optional)</span></Label>
          <Textarea
            id="case-desc"
            rows={4}
            placeholder="What happened, where and when, and who reported it. The AI uses this as standing context."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label>Priority</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.id}
                type="button"
                data-on={priority === p.id}
                onClick={() => setPriority(p.id)}
                className={cn('rounded-lg border py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-surface-3', p.cls)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !title.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Open case
          </Button>
        </div>
      </form>
    </Modal>
  );
};
