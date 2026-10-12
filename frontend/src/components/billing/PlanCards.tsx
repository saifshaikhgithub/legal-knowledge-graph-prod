import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, Check, Crown, Loader2, Sparkles } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import { useBilling } from '../../lib/BillingContext';
import { agencyFeatures, formatINR, freeFeatures, proFeatures } from '../../lib/billing';
import { COMPANY } from '../../lib/brand';
import type { Interval } from '../../lib/api';

export const IntervalToggle = ({ value, onChange, savingsPct, className }: {
  value: Interval; onChange: (v: Interval) => void; savingsPct: number; className?: string;
}) => (
  <div className={cn('inline-flex items-center gap-1 rounded-xl border bg-surface-2/70 p-1', className)} role="radiogroup" aria-label="Billing period">
    {(['monthly', 'yearly'] as const).map((v) => (
      <button
        key={v}
        role="radio"
        aria-checked={value === v}
        onClick={() => onChange(v)}
        className={cn(
          'relative flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
          value === v ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {value === v && (
          <motion.span layoutId="interval-pill" className="absolute inset-0 rounded-lg bg-surface-3 shadow-sm"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
        )}
        <span className="relative capitalize">{v}</span>
        {v === 'yearly' && savingsPct > 0 && (
          <span className="relative rounded-md bg-success/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-success">
            −{savingsPct}%
          </span>
        )}
      </button>
    ))}
  </div>
);

export const PriceTag = ({ interval, large }: { interval: Interval; large?: boolean }) => {
  const { plans } = useBilling();
  const price = interval === 'monthly' ? plans.monthly.price : plans.yearly.price;
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <motion.span
          key={price}
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className={cn('font-display font-bold tracking-tight', large ? 'text-5xl' : 'text-4xl')}
        >
          {formatINR(price)}
        </motion.span>
        <span className="text-sm text-muted-foreground">/{interval === 'monthly' ? 'month' : 'year'}</span>
      </div>
      <p className="mt-1.5 h-5 text-[13px] text-muted-foreground">
        {interval === 'yearly'
          ? <>Just {formatINR(plans.yearly.per_month)}/mo · <span className="text-success">save {formatINR(plans.yearly.savings)}</span></>
          : <>or {formatINR(plans.yearly.price)}/year, save {plans.yearly.savings_pct}%</>}
      </p>
    </div>
  );
};

const FeatureList = ({ items, tone = 'primary' }: { items: string[]; tone?: 'primary' | 'muted' | 'ai' }) => (
  <ul className="space-y-2.5 text-sm">
    {items.map((f) => (
      <li key={f} className="flex items-start gap-2.5">
        <Check className={cn('mt-0.5 h-4 w-4 shrink-0',
          tone === 'primary' ? 'text-primary' : tone === 'ai' ? 'text-ai' : 'text-muted-foreground')} />
        <span className="text-foreground/85">{f}</span>
      </li>
    ))}
  </ul>
);

/** Free / Pro / Agency cards. Works logged out (links to sign-up) and in the app (opens checkout). */
export const PlanCards = ({ interval }: { interval: Interval }) => {
  const { isAuthenticated } = useAuth();
  const { plans, summary, checkout, checkoutBusy } = useBilling();
  const plan = isAuthenticated ? summary?.plan : null;

  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-3">
      {/* Free */}
      <div className="flex flex-col rounded-2xl border bg-surface p-7">
        <div className="label-mono">Free</div>
        <h3 className="mt-2 font-display text-xl font-semibold">Trial</h3>
        <p className="mt-1 text-sm text-muted-foreground">Try the full workflow on a real case.</p>
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight">{formatINR(0)}</span>
          <span className="text-sm text-muted-foreground">/forever</span>
        </div>
        <p className="mt-1.5 h-5 text-[13px] text-muted-foreground">No card required</p>
        <div className="my-6 h-px bg-border" />
        <FeatureList items={freeFeatures(plans.free_limits)} tone="muted" />
        <div className="mt-auto pt-8">
          {plan ? (
            <Button variant="outline" className="w-full" disabled>{plan === 'free' ? 'Your current plan' : 'Included'}</Button>
          ) : (
            <Link to="/register"><Button variant="outline" className="w-full">Start free</Button></Link>
          )}
        </div>
      </div>

      {/* Pro */}
      <div className="relative flex flex-col rounded-2xl p-px">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-primary via-primary/40 to-ai/40" />
        <div className="relative flex flex-1 flex-col rounded-[15px] bg-surface p-7">
          <div className="absolute -top-3 left-7 flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-lg">
            <Sparkles className="h-3 w-3" /> Most popular
          </div>
          <div className="label-mono !text-primary">Pro</div>
          <h3 className="mt-2 flex items-center gap-2 font-display text-xl font-semibold">Investigator <Crown className="h-4 w-4 text-primary" /></h3>
          <p className="mt-1 text-sm text-muted-foreground">For detectives and analysts working live cases.</p>
          <div className="mt-6"><PriceTag interval={interval} /></div>
          <div className="my-6 h-px bg-border" />
          <FeatureList items={proFeatures} />
          <div className="mt-auto pt-8">
            {plan === 'pro' ? (
              <Link to="/app/billing"><Button variant="outline" className="w-full">Manage subscription</Button></Link>
            ) : plan === 'free' ? (
              <Button className="w-full" onClick={() => checkout(interval)} disabled={checkoutBusy}>
                {checkoutBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                Upgrade to Pro
              </Button>
            ) : (
              <Link to={`/register?plan=${interval}`}><Button className="w-full"><Crown className="h-4 w-4" /> Get Pro</Button></Link>
            )}
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Cancel anytime · UPI AutoPay, cards & net banking</p>
          </div>
        </div>
      </div>

      {/* Agency */}
      <div className="flex flex-col rounded-2xl border bg-surface p-7">
        <div className="label-mono !text-ai">Agency</div>
        <h3 className="mt-2 flex items-center gap-2 font-display text-xl font-semibold">Department <Building2 className="h-4 w-4 text-ai" /></h3>
        <p className="mt-1 text-sm text-muted-foreground">For police departments and government units.</p>
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="font-display text-4xl font-bold tracking-tight">Custom</span>
        </div>
        <p className="mt-1.5 h-5 text-[13px] text-muted-foreground">Volume pricing per officer</p>
        <div className="my-6 h-px bg-border" />
        <FeatureList items={agencyFeatures} tone="ai" />
        <div className="mt-auto pt-8">
          <a href={`mailto:${COMPANY.salesEmail}?subject=${encodeURIComponent('Agency plan enquiry')}`}>
            <Button variant="outline" className="w-full">Contact sales</Button>
          </a>
        </div>
      </div>
    </div>
  );
};
