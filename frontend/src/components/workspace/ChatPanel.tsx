import { memo, useEffect, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowUp, BrainCircuit, Check, ChevronDown, Copy, FileUp, Mic, Network, Paperclip, Square, X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { BRAND } from '../../lib/brand';
import { useSpeech } from '../../lib/useSpeech';
import type { Stage } from '../../lib/useInvestigation';
import type { ChatMessage, GraphStats, TimelineEvent } from '../../lib/api';
import { entityStyle } from '../../lib/entity';

const ACCEPT = '.pdf,.docx,.txt,.md,.csv,.log,.json,.jpg,.jpeg,.png,.webp';

const STAGE_LABEL: Record<Stage, string> = {
  idle: '',
  uploading: 'Processing evidence',
  extracting: 'Extracting entities & links',
  analyzing: 'Reviewing the case file',
  thinking: 'Reasoning',
  writing: 'Writing analysis',
};

const SUGGESTIONS = [
  { t: 'Summarise what we know', p: 'Summarise everything we know about this case so far, and what is still unknown.' },
  { t: 'Motive, means, opportunity', p: 'For each person of interest, assess motive, means and opportunity based on the evidence.' },
  { t: 'Find contradictions', p: 'Find contradictions between statements, alibis and the timeline.' },
  { t: 'Next 24 hours', p: 'What are the highest-value investigative actions for the next 24 hours, and why?' },
];

// ----------------------------------------------------------------- messages

const ReasoningTrace = ({ text, live }: { text: string; live: boolean }) => {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-ai/20 bg-ai/[0.04]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs">
        <BrainCircuit className={cn('h-3.5 w-3.5 text-ai', live && 'animate-pulse')} />
        <span className={cn('font-mono uppercase tracking-wider', live ? 'shimmer-text' : 'text-ai')}>
          {live ? 'Reasoning…' : 'Reasoning trace'}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{text.length.toLocaleString()} chars</span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-ai/15 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
};

const GraphDeltaChips = ({ m, onOpenGraph }: { m: ChatMessage; onOpenGraph: () => void }) => {
  const d = m.graphDelta;
  if (!d) return null;
  const parts = [
    d.entities_added && `+${d.entities_added} entities`,
    d.relations_added && `+${d.relations_added} links`,
    d.events_added && `+${d.events_added} events`,
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <button
      onClick={onOpenGraph}
      className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 font-mono text-[10.5px] text-primary transition-colors hover:bg-primary/15"
    >
      <Network className="h-3 w-3" />
      {parts.join(' · ')}
      <span className="text-primary/60">→ board</span>
    </button>
  );
};

const AssistantMessage = memo(({ m, stage, onOpenGraph }: { m: ChatMessage; stage: Stage; onOpenGraph: () => void }) => {
  const [copied, setCopied] = useState(false);
  const live = !!m.pending;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="group flex gap-3.5">
      <div className={cn(
        'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ai/30 bg-ai/10 text-ai',
        live && 'glow-ai',
      )}>
        <BrainCircuit className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-ai">{BRAND.assistant}</span>
          {live && stage !== 'idle' && (
            <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
              <span className="h-1 w-1 animate-pulse rounded-full bg-ai" /> {STAGE_LABEL[stage]}
            </span>
          )}
        </div>
        <GraphDeltaChips m={m} onOpenGraph={onOpenGraph} />
        <ReasoningTrace text={m.reasoning || ''} live={live && !m.content} />
        {m.content ? (
          <div className="prose-intel">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
            {live && <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-blink bg-ai" />}
          </div>
        ) : live && !m.reasoning ? (
          <div className="space-y-2 pt-1">
            {[92, 78, 64].map((w) => (
              <div key={w} className="h-3 animate-pulse rounded bg-surface-3" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : null}
        {m.error && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {m.error}
          </div>
        )}
        {!live && m.content && (
          <div className="mt-2 flex opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={copy} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-surface-3 hover:text-foreground">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
AssistantMessage.displayName = 'AssistantMessage';

const UserMessage = ({ m }: { m: ChatMessage }) => (
  <div className="flex justify-end">
    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md border bg-surface-3/80 px-4 py-2.5 text-[14.5px] leading-relaxed">
      {m.content}
    </div>
  </div>
);

// --------------------------------------------------------------- side panel

const CasePulse = ({ stats, timeline, aiOnline, model }: {
  stats: GraphStats | null; timeline: TimelineEvent[]; aiOnline: boolean | null; model: string;
}) => {
  const types = Object.entries(stats?.by_type || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...types.map(([, n]) => n));
  return (
    <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l bg-surface/40 p-5 2xl:block">
      <div className="label-mono mb-3">Analyst status</div>
      <div className="mb-6 rounded-xl border bg-surface p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className={cn('h-2 w-2 rounded-full', aiOnline ? 'bg-success shadow-[0_0_8px_hsl(var(--success))]' : aiOnline === false ? 'bg-destructive' : 'bg-muted-foreground')} />
          {aiOnline ? 'Online' : aiOnline === false ? 'Offline: no API key' : 'Checking…'}
        </div>
        {model && <div className="mt-1.5 truncate font-mono text-[10.5px] text-muted-foreground" title={model}>{model}</div>}
      </div>

      <div className="label-mono mb-3">Entities by type</div>
      {types.length ? (
        <div className="mb-6 space-y-2.5">
          {types.map(([type, n]) => {
            const s = entityStyle(type);
            return (
              <div key={type}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5"><s.icon className="h-3 w-3" style={{ color: s.color }} />{type}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{n}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="h-full rounded-full" style={{ background: s.color }} initial={{ width: 0 }} animate={{ width: `${(n / max) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mb-6 text-xs text-muted-foreground">Nothing mapped yet.</p>
      )}

      <div className="label-mono mb-3">Latest events</div>
      {timeline.length ? (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {timeline.slice(-5).reverse().map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full border-2 border-background bg-primary" />
              <div className="font-mono text-[10.5px] text-primary">{e.time}</div>
              <div className="text-xs leading-snug text-foreground/85">{e.description}</div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">No dated events yet.</p>
      )}
    </aside>
  );
};

// ------------------------------------------------------------------- panel

interface Props {
  caseTitle: string;
  messages: ChatMessage[];
  loadingHistory: boolean;
  stage: Stage;
  uploadNote: string;
  busy: boolean;
  onSend: (text: string, files: File[]) => void;
  onStop: () => void;
  onOpenGraph: () => void;
  stats: GraphStats | null;
  timeline: TimelineEvent[];
  aiOnline: boolean | null;
  model: string;
}

export const ChatPanel = (props: Props) => {
  const { messages, loadingHistory, stage, uploadNote, busy, onSend, onStop, onOpenGraph } = props;
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech((t) => setInput((v) => (v && !v.endsWith(' ') ? v + ' ' : v) + t));

  // Follow the stream unless the investigator scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);

  const submit = (text = input) => {
    if (busy || (!text.trim() && !files.length)) return;
    if (speech.listening) speech.toggle();
    stickRef.current = true;
    onSend(text, files);
    setInput('');
    setFiles([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 6));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex h-full min-h-0">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={onDrop}
      >
        <AnimatePresence>
          {dragging && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-primary/60 bg-background/80 backdrop-blur-sm"
            >
              <div className="text-center">
                <FileUp className="mx-auto h-10 w-10 text-primary" />
                <p className="mt-3 font-display text-lg font-semibold">Drop evidence to analyse</p>
                <p className="text-sm text-muted-foreground">Statements, reports, transcripts, scene photos</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className="flex-1 overflow-y-auto"
        >
          {loadingHistory ? (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-2" />)}
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-12">
              <div className="mb-8">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-ai/30 bg-ai/10 text-ai glow-ai">
                  <BrainCircuit className="h-6 w-6" />
                </div>
                <h2 className="font-display text-3xl font-bold tracking-tight">Brief me on the case.</h2>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  Type or dictate what you know, or drop in statements, reports and scene photos.
                  {' '}{BRAND.assistant} maps every person, place and event, then reasons through it with you.
                </p>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.t}
                    onClick={() => submit(s.p)}
                    className="group rounded-xl border bg-surface/60 p-4 text-left transition-all hover:border-primary/40 hover:bg-surface-2"
                  >
                    <div className="text-sm font-medium group-hover:text-primary">{s.t}</div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.p}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-7 px-4 py-8">
              {messages.map((m, i) => (
                <motion.div key={m.id ? `${m.role}-${m.id}` : `local-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  {m.role === 'user' ? <UserMessage m={m} /> : <AssistantMessage m={m} stage={stage} onOpenGraph={onOpenGraph} />}
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="px-4 pb-4 pt-2">
          <div className="mx-auto max-w-3xl">
            {uploadNote && (
              <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> {uploadNote}
              </div>
            )}
            <div className={cn(
              'rounded-2xl border bg-surface/90 shadow-lg backdrop-blur transition-all focus-within:border-primary/50 focus-within:shadow-[0_0_0_4px_hsl(var(--primary)/.08)]',
              speech.listening && 'border-destructive/50',
            )}>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
                  {files.map((f, i) => (
                    <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-md border bg-surface-2 py-1 pl-2 pr-1 text-xs">
                      <Paperclip className="h-3 w-3 text-primary" />
                      <span className="max-w-[180px] truncate">{f.name}</span>
                      <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="rounded p-0.5 hover:bg-surface-3" aria-label={`Remove ${f.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={speech.listening ? 'Listening…' : 'Add case information or ask a question…'}
                className="block max-h-[220px] w-full resize-none bg-transparent px-4 pt-3.5 text-[14.5px] leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
              />
              {speech.listening && speech.interim && (
                <div className="px-4 text-sm italic text-muted-foreground">{speech.interim}</div>
              )}
              <div className="flex items-center gap-1 px-2 pb-2 pt-1">
                <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={busy} title="Attach evidence" aria-label="Attach evidence">
                  <Paperclip className="h-4 w-4" />
                </Button>
                {speech.supported && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={speech.toggle}
                    disabled={busy}
                    title={speech.listening ? 'Stop dictation' : 'Dictate'}
                    aria-label="Dictate"
                    className={cn(speech.listening && 'bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive')}
                  >
                    <Mic className={cn('h-4 w-4', speech.listening && 'animate-pulse')} />
                  </Button>
                )}
                <span className="ml-2 hidden font-mono text-[10px] text-muted-foreground sm:inline">
                  Enter to send · Shift+Enter for new line
                </span>
                <div className="ml-auto">
                  {busy ? (
                    <Button size="icon-sm" variant="secondary" onClick={onStop} title="Stop" aria-label="Stop">
                      <Square className="h-3.5 w-3.5 fill-current" />
                    </Button>
                  ) : (
                    <Button size="icon-sm" onClick={() => submit()} disabled={!input.trim() && !files.length} aria-label="Send">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              AI-assisted analysis. Verify every finding independently before acting on it.
            </p>
          </div>
        </div>
      </div>

      <CasePulse stats={props.stats} timeline={props.timeline} aiOnline={props.aiOnline} model={props.model} />
    </div>
  );
};
