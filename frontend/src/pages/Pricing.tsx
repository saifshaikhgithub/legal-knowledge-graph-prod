import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, ChevronDown, Minus, ShieldCheck } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';
import { IntervalToggle, PlanCards } from '../components/billing/PlanCards';
import { useBilling } from '../lib/BillingContext';
import { formatINR } from '../lib/billing';
import { BRAND, COMPANY } from '../lib/brand';
import type { Interval } from '../lib/api';

type Cell = boolean | string;

export const Pricing = () => {
  const { plans } = useBilling();
  const [interval, setBillingInterval] = useState<Interval>('yearly');
  const f = plans.free_limits;

  const rows: [string, Cell, Cell, Cell][] = [
    ['Cases', `${f.cases}`, 'Unlimited', 'Unlimited'],
    [`${BRAND.assistant} AI questions`, `${f.messages} / month`, 'Unlimited*', 'Unlimited'],
    ['Evidence uploads (PDF, DOCX, photos)', `${f.uploads} / month`, 'Unlimited*', 'Unlimited'],
    ['AI case briefs & suspect scoring', `${f.briefs} / month`, 'Unlimited*', 'Unlimited'],
    ['Evidence board, timeline & contradiction finder', true, true, true],
    ['Case file export', false, true, true],
    ['SHA-256 chain of custody & audit log', true, true, true],
    ['Officers per account', '1', '1', 'Whole department'],
    ['On-premise / air-gapped deployment', false, false, true],
    ['SSO, role-based access, data residency', false, false, true],
    ['Support', 'Email', 'Priority email', 'Dedicated manager'],
  ];

  const faqs = [
    ['Can I cancel anytime?', 'Yes. Cancel from Plan & billing in one click. You keep Pro until the end of the period you have paid for, and you are never charged again.'],
    ['How do I pay?', 'Payments are processed by Razorpay. You can use UPI AutoPay, any credit or debit card, or a net-banking e-mandate. Renewals are charged automatically, and you are notified before each one.'],
    ['Monthly or yearly?', `Yearly costs ${formatINR(plans.yearly.price)}, which works out to ${formatINR(plans.yearly.per_month)} a month and saves you ${formatINR(plans.yearly.savings)} compared with paying monthly.`],
    ['What happens when I reach a free limit?', 'Everything you have built stays. New AI questions, uploads or briefs pause until the next month, or until you upgrade.'],
    ['What does "Unlimited*" mean?', `Pro includes up to ${plans.pro_limits.messages.toLocaleString('en-IN')} AI questions, ${plans.pro_limits.uploads.toLocaleString('en-IN')} uploads and ${plans.pro_limits.briefs} briefs a month. That is far beyond what a working investigator uses, and it protects the service from automated abuse.`],
    ['Do you offer refunds?', 'Yes. If Pro is not for you, write to us within 7 days of your first payment for a full refund. See the refund policy for details.'],
    ['We are a police department. Can we buy for the whole unit?', `Yes. The Agency plan includes on-premise deployment, invoice and PO billing, and onboarding. Email ${COMPANY.salesEmail}.`],
  ];

  return (
    <div className="min-h-full overflow-x-hidden bg-background">
      <SiteHeader />

      <section className="relative isolate pt-32">
        <div className="absolute inset-0 -z-10 grid-bg [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
        <div className="absolute left-1/2 top-24 -z-10 h-[380px] w-[760px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="label-mono mb-4 !text-primary">Pricing</div>
            <h1 className="mx-auto max-w-3xl font-display text-[clamp(2.2rem,5vw,3.6rem)] font-bold leading-[1.05] tracking-tight">
              An analyst on every case,<br /><span className="text-gradient">for less than a day of overtime.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
              Start free. Upgrade when {BRAND.name} is pulling its weight. Cancel whenever you like.
            </p>
          </motion.div>
          <IntervalToggle value={interval} onChange={setBillingInterval} savingsPct={plans.yearly.savings_pct} className="mt-10" />
        </div>
        <div className="mx-auto mt-12 max-w-6xl px-4 sm:px-6">
          <PlanCards interval={interval} />
          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" /> Payments secured by Razorpay. All prices in Indian Rupees.
          </p>
        </div>
      </section>

      {/* Comparison */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <h2 className="font-display text-2xl font-bold tracking-tight">Compare plans</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b bg-surface-2/60 text-left">
                <th className="p-4 font-medium text-muted-foreground">Feature</th>
                <th className="p-4 font-display font-semibold">Free</th>
                <th className="p-4 font-display font-semibold text-primary">Pro</th>
                <th className="p-4 font-display font-semibold text-ai">Agency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, ...cells]) => (
                <tr key={label} className="border-b last:border-0 hover:bg-surface-2/40">
                  <td className="p-4 text-foreground/85">{label}</td>
                  {cells.map((c, i) => (
                    <td key={i} className="p-4">
                      {c === true ? <Check className="h-4 w-4 text-success" />
                        : c === false ? <Minus className="h-4 w-4 text-muted-foreground/50" />
                        : <span className="text-foreground/85">{c}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">* Fair-use limits apply. See the FAQ below.</p>
      </section>

      {/* FAQ */}
      <section className="mx-auto mb-24 mt-24 max-w-3xl px-4 sm:px-6">
        <h2 className="text-center font-display text-2xl font-bold tracking-tight">Questions</h2>
        <div className="mt-8 divide-y rounded-2xl border bg-surface">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Still deciding? <Link to="/register" className="text-primary hover:underline">Start free</Link>. No card needed.
        </p>
      </section>

      <SiteFooter />
    </div>
  );
};
