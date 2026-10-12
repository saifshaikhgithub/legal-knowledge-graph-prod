import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, BrainCircuit, Clock3, FileSearch, Fingerprint, Lock, Network, ScrollText, ServerCog,
  ShieldCheck, Sparkles, Target, Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';
import { IntervalToggle, PlanCards } from '../components/billing/PlanCards';
import { NetworkBackground } from '../components/NetworkBackground';
import { useAuth } from '../lib/AuthContext';
import { useBilling } from '../lib/BillingContext';
import type { Interval } from '../lib/api';
import { BRAND } from '../lib/brand';

const features = [
  { icon: Network, title: 'Living evidence graph', body: 'Every statement, report and photo is mapped into people, places, vehicles and links - automatically, as the case grows.' },
  { icon: BrainCircuit, title: 'Reasoning analyst', body: `${BRAND.assistant} separates fact from inference, cites the case file and shows its reasoning trace. No black box.` },
  { icon: Target, title: 'Persons of interest', body: 'Motive, means and opportunity scored for every person of interest, with the evidence for and against.' },
  { icon: Clock3, title: 'Auto timeline', body: 'Times and dates pulled from every document into one chronology, so gaps and alibi conflicts stand out.' },
  { icon: FileSearch, title: 'Contradiction finder', body: 'Statements that disagree with each other or with the timeline are flagged before they reach court.' },
  { icon: ScrollText, title: 'One-click case file', body: 'Export the brief, entity register, timeline, evidence hashes and full investigation log as a report.' },
];

const trust = [
  { icon: ServerCog, title: 'Runs on your servers', body: 'Open-weight models via NVIDIA NIM. Deploy fully air-gapped, so case data never leaves your network.' },
  { icon: Fingerprint, title: 'Chain of custody', body: 'Every evidence file is SHA-256 fingerprinted on intake and logged with who uploaded it and when.' },
  { icon: ScrollText, title: 'Complete audit trail', body: 'Logins, queries, edits and exports are recorded in an append-only audit log.' },
  { icon: ShieldCheck, title: 'Built-in safeguards', body: 'Presumption of innocence and no profiling on protected traits are built into every prompt.' },
];

const fade = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.5, ease: 'easeOut' },
} as const;

export const Landing = () => {
  const { isAuthenticated } = useAuth();
  const { plans } = useBilling();
  const [interval, setBillingInterval] = useState<Interval>('yearly');

  return (
    <div className="min-h-full overflow-x-hidden bg-background">
      <SiteHeader home />

      {/* Hero */}
      <section className="relative isolate flex min-h-[100svh] items-center pt-16">
        <div className="absolute inset-0 -z-10 grid-bg [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <NetworkBackground className="absolute inset-0 -z-10 h-full w-full opacity-70" />
        <div className="absolute left-1/2 top-1/3 -z-10 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

        <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6">
          <motion.div {...fade} className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-primary" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            AI case intelligence for investigators
          </motion.div>

          <motion.h1 {...fade} className="mx-auto max-w-4xl font-display text-[clamp(2.4rem,6.5vw,5rem)] font-bold leading-[1.02] tracking-tight">
            Every clue connected.<br />
            <span className="text-gradient">Nothing missed.</span>
          </motion.h1>

          <motion.p {...fade} transition={{ ...fade.transition, delay: 0.1 }} className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
            {BRAND.name} reads witness statements, reports and scene photos, builds a live evidence graph and
            timeline, and reasons through the case with your detectives: who, where, when, and what doesn't add up.
          </motion.p>

          <motion.div {...fade} transition={{ ...fade.transition, delay: 0.2 }} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to={isAuthenticated ? '/app' : '/register'}>
              <Button size="lg" className="w-full sm:w-auto">
                {isAuthenticated ? 'Open workspace' : 'Start an investigation'} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how"><Button size="lg" variant="outline" className="w-full sm:w-auto">See how it works</Button></a>
          </motion.div>

          {/* Product preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3 }}
            className="relative mx-auto mt-16 max-w-5xl"
          >
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/40 via-border to-transparent" />
            <div className="relative overflow-hidden rounded-2xl border bg-surface/90 text-left shadow-2xl backdrop-blur">
              <div className="flex items-center gap-2 border-b px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
                <span className="ml-3 font-mono text-[11px] text-muted-foreground">CI-2026-0142 · Riverside Warehouse Homicide</span>
              </div>
              <div className="grid gap-0 md:grid-cols-[1.15fr_1fr]">
                <div className="space-y-4 border-b p-5 md:border-b-0 md:border-r">
                  <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-surface-3 px-3.5 py-2.5 text-[13px]">
                    Night guard says he saw a grey Honda leave at 23:10. Chen claims he was home by 22:30.
                  </div>
                  <div className="space-y-2 text-[13px] leading-relaxed">
                    <div className="flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      <span className="h-3 w-1 rounded-full bg-primary" /> Contradictions & red flags
                    </div>
                    <p className="text-foreground/85">
                      <b>Michael Chen</b>'s alibi (home by 22:30) conflicts with the guard's sighting of a vehicle matching his
                      <b> grey Honda Civic</b> at 23:10 <span className="text-muted-foreground">(statement #3, conf. 0.8)</span>.
                    </p>
                    <div className="flex items-center gap-2 pt-1 font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                      <span className="h-3 w-1 rounded-full bg-primary" /> Next steps
                    </div>
                    <p className="text-foreground/85">1. Pull ANPR / traffic camera data on Dock Rd, 22:30-23:30.</p>
                  </div>
                </div>
                <div className="relative h-56 md:h-auto">
                  <NetworkBackground className="absolute inset-0 h-full w-full" density={0.0006} />
                  <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
                    {[['Person', 'bg-rose-500'], ['Location', 'bg-sky-400'], ['Vehicle', 'bg-orange-400'], ['Event', 'bg-amber-400']].map(([t, c]) => (
                      <span key={t} className="flex items-center gap-1.5 rounded-md border bg-surface/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        <span className={`h-1.5 w-1.5 rounded-full ${c}`} />{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative border-t py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div {...fade} className="max-w-2xl">
            <div className="label-mono mb-3 !text-primary">The platform</div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">An analyst that never forgets a detail.</h2>
            <p className="mt-4 text-muted-foreground">
              Major cases drown in paper. {BRAND.name} keeps every name, place, vehicle and timestamp connected, so
              investigators spend their time on judgement, not cross-referencing.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div key={f.title} {...fade} transition={{ ...fade.transition, delay: i * 0.05 }} className="group bg-surface p-7 transition-colors hover:bg-surface-2">
                <div className="mb-5 grid h-10 w-10 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t bg-surface/40 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <motion.div {...fade} className="mx-auto max-w-2xl text-center">
            <div className="label-mono mb-3 !text-primary">Workflow</div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">From case file to leads in minutes</h2>
          </motion.div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              { n: '01', icon: FileSearch, t: 'Feed the case', d: 'Type notes, dictate by voice, or drop in statements, reports and scene photos.' },
              { n: '02', icon: Network, t: 'Watch it connect', d: 'Entities, relationships and events land on the evidence board and timeline in real time.' },
              { n: '03', icon: Sparkles, t: 'Interrogate the case', d: `Ask ${BRAND.assistant} anything. Generate a brief with scored persons of interest and next steps.` },
            ].map((s, i) => (
              <motion.div key={s.n} {...fade} transition={{ ...fade.transition, delay: i * 0.1 }} className="relative rounded-2xl border bg-surface p-7">
                <div className="font-mono text-5xl font-semibold text-primary/15">{s.n}</div>
                <s.icon className="absolute right-7 top-8 h-6 w-6 text-primary" />
                <h3 className="mt-4 font-display text-xl font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="border-t py-24">
        <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div {...fade}>
            <div className="label-mono mb-3 !text-primary">Built for government</div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Sensitive data stays sovereign.</h2>
            <p className="mt-4 text-muted-foreground">
              Law enforcement can't send case files to a consumer chatbot. {BRAND.name} is built to be deployed inside your
              own infrastructure, with the controls procurement teams ask for.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['On-premise', 'Air-gapped', 'Audit logging', 'Role-based access', 'Data residency'].map((t) => (
                <span key={t} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3 text-primary" /> {t}
                </span>
              ))}
            </div>
          </motion.div>
          <div className="grid gap-4 sm:grid-cols-2">
            {trust.map((t, i) => (
              <motion.div key={t.title} {...fade} transition={{ ...fade.transition, delay: i * 0.06 }} className="rounded-2xl border bg-surface p-6">
                <t.icon className="h-5 w-5 text-ai" />
                <h3 className="mt-4 font-semibold">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t bg-surface/40 py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div {...fade} className="mx-auto max-w-2xl text-center">
            <div className="label-mono mb-3 !text-primary">Pricing</div>
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Start free. Upgrade when it pays for itself.</h2>
            <p className="mt-4 text-muted-foreground">One closed case is worth more than a year of {BRAND.name}.</p>
            <IntervalToggle value={interval} onChange={setBillingInterval} savingsPct={plans.yearly.savings_pct} className="mt-8" />
          </motion.div>
          <div className="mt-12"><PlanCards interval={interval} /></div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            <Link to="/pricing" className="text-primary hover:underline">Compare every feature →</Link>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t py-24">
        <div className="tape absolute inset-x-0 top-0 h-2 opacity-80" />
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <Users className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-5 font-display text-3xl font-bold tracking-tight sm:text-4xl">Give every detective an analyst.</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Pilot {BRAND.name} on a closed case and compare it with your own findings. Most teams see the value on day one.
          </p>
          <Link to={isAuthenticated ? '/app' : '/register'} className="mt-8 inline-block">
            <Button size="lg">{isAuthenticated ? 'Open workspace' : 'Start free'} <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};
