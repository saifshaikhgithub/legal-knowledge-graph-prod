import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { motion } from 'framer-motion';
import { Copy, FileImage, FileText, Fingerprint, Loader2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/entity';
import { api, type Evidence } from '../../lib/api';

interface Props {
  caseId: number;
  items: Evidence[] | null;
  uploading: string;
  onUpload: (files: File[]) => void;
}

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.log,.json,.jpg,.jpeg,.png,.webp';

export const EvidenceView = ({ caseId, items, uploading, onUpload }: Props) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<Evidence | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);

  const open = async (ev: Evidence) => {
    setViewing(ev);
    setLoadingItem(true);
    try {
      setViewing(await api.getEvidenceItem(caseId, ev.id));
    } finally {
      setLoadingItem(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) onUpload(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label-mono mb-1 !text-primary">Chain of custody</div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Evidence locker</h2>
            <p className="mt-1 text-sm text-muted-foreground">Every file is fingerprinted with SHA-256 on intake and mined for entities.</p>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={cn(
            'mb-8 cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
            dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-surface-2/50',
          )}
        >
          <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
                 onChange={(e) => { if (e.target.files?.length) onUpload(Array.from(e.target.files)); e.target.value = ''; }} />
          {uploading ? (
            <>
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 font-medium">{uploading}</p>
              <p className="text-sm text-muted-foreground">Extracting text and mapping entities…</p>
            </>
          ) : (
            <>
              <Upload className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-medium">Drop evidence files or click to browse</p>
              <p className="text-sm text-muted-foreground">PDF, DOCX, TXT, CSV, logs, and scene photos (JPG, PNG, WEBP)</p>
            </>
          )}
        </div>

        {!items ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />)}</div>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No evidence logged for this case yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[1fr_110px_180px_130px] gap-4 border-b bg-surface-2/60 px-4 py-2.5 label-mono md:grid">
              <span>File</span><span>Size</span><span>SHA-256</span><span>Logged</span>
            </div>
            {items.map((ev, i) => (
              <motion.button
                key={ev.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                onClick={() => open(ev)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b px-4 py-3 text-left last:border-0 hover:bg-surface-2/60 md:grid-cols-[1fr_110px_180px_130px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', ev.kind === 'image' ? 'border-ai/30 bg-ai/10 text-ai' : 'border-primary/30 bg-primary/10 text-primary')}>
                    {ev.kind === 'image' ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{ev.filename}</span>
                    <span className="block truncate text-xs text-muted-foreground">{ev.preview.slice(0, 90)}</span>
                  </span>
                </span>
                <span className="hidden font-mono text-xs text-muted-foreground md:block">{ev.char_count.toLocaleString()} chars</span>
                <span className="hidden items-center gap-1.5 font-mono text-xs text-muted-foreground md:flex">
                  <Fingerprint className="h-3 w-3 text-success" />{ev.sha256.slice(0, 16)}…
                </span>
                <span className="font-mono text-xs text-muted-foreground">{formatDate(ev.created_at, true)}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.filename} className="max-w-3xl">
        {viewing && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge tone={viewing.kind === 'image' ? 'ai' : 'primary'}>{viewing.kind}</Badge>
              <Badge>{formatDate(viewing.created_at, true)}</Badge>
              <button
                onClick={() => navigator.clipboard?.writeText(viewing.sha256).catch(() => {})}
                className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground hover:text-foreground"
                title="Copy full SHA-256"
              >
                <Fingerprint className="h-3 w-3 text-success" /> sha256:{viewing.sha256.slice(0, 24)}… <Copy className="h-3 w-3" />
              </button>
            </div>
            {viewing.kind === 'image' && <div className="label-mono mb-2">AI forensic description</div>}
            <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-surface-2/60 p-4 font-mono text-[12.5px] leading-relaxed">
              {loadingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : viewing.content || viewing.preview}
            </div>
            <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={() => setViewing(null)}>Close</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
};
