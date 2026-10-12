import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, ArrowRight, BrainCircuit, CheckCircle2, CircleHelp, Lightbulb, ListChecks, Loader2, RefreshCw,
  ShieldAlert, Target, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, SectionTitle } from '../ui/Card';
import { cn } from '../../lib/utils';
import { BRAND } from '../../lib/brand';
import { timeAgo } from '../../lib/entity';
import type { Brief, PersonOfInterest } from '../../lib/api';

interface Props {
  brief: Brief | null;
  generatedAt: string | null;
  loading: boolean;
  generating: boolean;
  error: string;
  hasData: boolean;
  onGenerate: () => void;
}

const scoreColor = (s: number) => (s >= 70 ? 'hsl(var(--destructive))' : s >= 40 ? '#f97316' : s >= 15 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))');

const ScoreRing = ({ score }: { score: number }) => {
  const r = 22, c = 2 * Math.PI * r;
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="hsl(var(--surface-3))" strokeWidth="5" />
        <motion.circle
          cx="28" cy="28" r={r} fill="none" stroke={scoreColor(score)} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (c * score) / 100 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-sm font-semibold">{score}</div>
    </div>
  );
};

const PersonCard = ({ p, rank }: { p: PersonOfInterest; rank: number }) => {
  const [open, setOpen] = useState(rank === 0);
  const rows = [['Motive', p.motive], ['Means', p.means], ['Opportunity', p.opportunity], ['Alibi', p.alibi]].filter(([, v]) => v);
  return (
    <Card className={cn('overflow-hidden transition-colors', rank === 0 && p.role !== 'victim' && p.suspicion_score >= 40 && 'border-destructive/30')}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-4 text-left">
        {p.role === 'victim' ? (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-dashed border-muted-foreground/40 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground" title="Victims are not scored">
            Victim
          </div>
        ) : (
          <ScoreRing score={Math.max(0, Math.min(100, Math.round(p.suspicion_score || 0)))} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{p.name}</span>
            <Badge tone={p.role === 'suspect' ? 'danger' : p.role === 'victim' ? 'ai' : 'neutral'}>{p.role}</Badge>
          </div>
          {p.reasoning && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.reasoning}</p>}
        </div>
      </button>
      {open && (rows.length > 0 || p.key_evidence?.length) && (
        <div className="border-t bg-surface-2/40 px-4 py-3">
          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="label-mono !text-[9.5px]">{k}</dt>
                <dd className="mt-0.5 text-sm">{v}</dd>
              </div>
            ))}
          </dl>
          {p.key_evidence && p.key_evidence.length > 0 && (
            <div className="mt-3">
              <div className="label-mono mb-1.5 !text-[9.5px]">Key evidence</div>
              <ul className="space-y-1 text-sm">
                {p.key_evidence.map((e, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ai" />{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export const BriefView = ({ brief, generatedAt, loading, generating, error, hasData, onGenerate }: Props) => {
  if (loading) return <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  if (!brief) {
    return (
      <div className="grid h-full place-items-center grid-bg px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-ai/30 bg-ai/10 text-ai glow-ai">
            {generating ? <Loader2 className="h-7 w-7 animate-spin" /> : <ShieldAlert className="h-7 w-7" />}
          </div>
          <h3 className="mt-5 font-display text-2xl font-bold">{generating ? 'Analysing the case file…' : 'Intelligence brief'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {generating
              ? `${BRAND.assistant} is weighing every person, link and timestamp. This can take a minute.`
              : 'A scored assessment of persons of interest, competing hypotheses, contradictions, evidence gaps and next steps.'}
          </p>
          {error && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {!generating && (
            <Button variant="ai" size="lg" className="mt-6" onClick={onGenerate} disabled={!hasData}>
              <BrainCircuit className="h-4 w-4" /> Generate brief
            </Button>
          )}
          {!hasData && !generating && <p className="mt-3 text-xs text-muted-foreground">Add case information first.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-2xl border bg-surface p-6 sm:p-8">
          <div className="tape absolute inset-x-0 top-0 h-1.5 opacity-90" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="label-mono !text-primary">Intelligence brief · Restricted</div>
            <div className="flex items-center gap-3">
              {generatedAt && <span className="font-mono text-[11px] text-muted-foreground">Generated {timeAgo(generatedAt)}</span>}
              <Button variant="outline" size="sm" onClick={onGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {generating ? 'Re-analysing…' : 'Regenerate'}
              </Button>
            </div>
          </div>
          {brief.headline && <h2 className="mt-4 font-display text-2xl font-bold leading-snug tracking-tight sm:text-[28px]">{brief.headline}</h2>}
          {brief.summary && <p className="mt-4 max-w-3xl leading-relaxed text-foreground/80">{brief.summary}</p>}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          {/* Persons of interest */}
          <section>
            <SectionTitle icon={<Target className="h-4 w-4" />}>Persons of interest</SectionTitle>
            <div className="space-y-3">
              {(brief.persons_of_interest || []).map((p, i) => <PersonCard key={p.name + i} p={p} rank={i} />)}
              {!brief.persons_of_interest?.length && <p className="text-sm text-muted-foreground">None identified yet.</p>}
            </div>
          </section>

          <div className="space-y-8">
            {/* Contradictions */}
            {!!brief.contradictions?.length && (
              <section>
                <SectionTitle icon={<AlertTriangle className="h-4 w-4" />}>Contradictions</SectionTitle>
                <div className="space-y-2">
                  {brief.contradictions.map((c, i) => (
                    <div key={i} className={cn(
                      'rounded-xl border-l-[3px] border bg-surface p-3.5 text-sm',
                      c.severity === 'high' ? 'border-l-destructive' : c.severity === 'medium' ? 'border-l-orange-500' : 'border-l-primary',
                    )}>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone={c.severity === 'high' ? 'danger' : c.severity === 'medium' ? 'warning' : 'primary'}>{c.severity || 'note'}</Badge>
                      </div>
                      {c.description}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Next steps */}
            {!!brief.next_steps?.length && (
              <section>
                <SectionTitle icon={<ListChecks className="h-4 w-4" />}>Next steps</SectionTitle>
                <ol className="space-y-2">
                  {brief.next_steps.map((s, i) => (
                    <li key={i} className="flex gap-3 rounded-xl border bg-surface p-3 text-sm">
                      <span className="font-mono text-xs font-semibold text-primary">{String(i + 1).padStart(2, '0')}</span>{s}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>

        {/* Hypotheses */}
        {!!brief.hypotheses?.length && (
          <section>
            <SectionTitle icon={<Lightbulb className="h-4 w-4" />}>Competing hypotheses</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {brief.hypotheses.map((h, i) => (
                <Card key={i} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium leading-snug">{h.theory}</p>
                    <span className="font-mono text-lg font-semibold text-primary">{h.likelihood}%</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-ai" initial={{ width: 0 }} animate={{ width: `${h.likelihood}%` }} transition={{ duration: 0.9 }} />
                  </div>
                  <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase text-success"><ThumbsUp className="h-3 w-3" /> For</div>
                      <ul className="space-y-1 text-muted-foreground">{(h.supporting || []).map((s, j) => <li key={j}>• {s}</li>)}</ul>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase text-destructive"><ThumbsDown className="h-3 w-3" /> Against</div>
                      <ul className="space-y-1 text-muted-foreground">{(h.against || []).map((s, j) => <li key={j}>• {s}</li>)}</ul>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          {!!brief.leads?.length && (
            <section>
              <SectionTitle icon={<ArrowRight className="h-4 w-4" />}>Leads</SectionTitle>
              <div className="space-y-2">
                {brief.leads.map((l, i) => (
                  <div key={i} className="rounded-xl border bg-surface p-3.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={l.priority === 'high' ? 'danger' : l.priority === 'medium' ? 'warning' : 'neutral'}>{l.priority || 'lead'}</Badge>
                      <span className="text-sm font-medium">{l.lead}</span>
                    </div>
                    {l.rationale && <p className="mt-1.5 text-[13px] text-muted-foreground">{l.rationale}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
          {!!brief.evidence_gaps?.length && (
            <section>
              <SectionTitle icon={<CircleHelp className="h-4 w-4" />}>Evidence gaps</SectionTitle>
              <ul className="space-y-2">
                {brief.evidence_gaps.map((g, i) => (
                  <li key={i} className="flex gap-2.5 rounded-xl border border-dashed bg-surface/60 p-3 text-sm">
                    <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-ai" />{g}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <p className="pb-4 text-center text-[11px] text-muted-foreground">
          Scores reflect the strength of evidence in this case file only. They are not findings of guilt.
        </p>
      </div>
    </div>
  );
};
