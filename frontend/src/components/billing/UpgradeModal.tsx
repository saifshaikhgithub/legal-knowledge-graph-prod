import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Crown, Loader2, Lock, PartyPopper, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { IntervalToggle, PriceTag } from './PlanCards';
import { useBilling } from '../../lib/BillingContext';
import { formatINR, priceFor, proFeatures } from '../../lib/billing';
import { BRAND, COMPANY } from '../../lib/brand';
import { formatDate } from '../../lib/entity';
import type { Interval } from '../../lib/api';

/** Opened from the sidebar, the billing page, or automatically when a plan limit is hit. */
export const UpgradeModal = () => {
  const { upgrade, closeUpgrade, plans, checkout, checkoutBusy, checkoutError } = useBilling();
  const [interval, setBillingInterval] = useState<Interval>('yearly');

  return (
    <Modal open={upgrade.open} onClose={closeUpgrade} className="max-w-md" title={
      <span className="flex items-center gap-2"><Crown className="h-5 w-5 text-primary" /> Upgrade to {BRAND.name} Pro</span>
    }>
      {upgrade.paywall && (
        <div className="mb-5 flex gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.08] p-3 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="text-foreground/90">{upgrade.paywall.message}</span>
        </div>
      )}

      <IntervalToggle value={interval} onChange={setBillingInterval} savingsPct={plans.yearly.savings_pct} className="w-full [&>button]:flex-1 [&>button]:justify-center" />

      <div className="mt-5 rounded-xl border bg-surface-2/50 p-5">
        <PriceTag interval={interval} large />
        <ul className="mt-5 space-y-2 text-sm">
          {proFeatures.slice(0, 5).map((f) => (
            <li key={f} className="flex items-center gap-2.5"><Check className="h-4 w-4 shrink-0 text-primary" />{f}</li>
          ))}
        </ul>
      </div>

      {checkoutError && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{checkoutError}</p>
      )}

      <Button size="lg" className="mt-5 w-full" onClick={() => checkout(interval)} disabled={checkoutBusy}>
        {checkoutBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening secure checkout…</>
          : <><Lock className="h-4 w-4" /> Pay {formatINR(priceFor(plans, interval))} securely</>}
      </Button>
      {!plans.enabled && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Online checkout opens soon. Need Pro today? <a className="text-primary hover:underline" href={`mailto:${COMPANY.salesEmail}`}>{COMPANY.salesEmail}</a>
        </p>
      )}
      <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-success" /> Secured by Razorpay · Cancel anytime ·{' '}
        <Link to="/pricing" onClick={closeUpgrade} className="text-primary hover:underline">Compare plans</Link>
      </div>
    </Modal>
  );
};

export const WelcomeProModal = () => {
  const { welcome, dismissWelcome, summary } = useBilling();
  return (
    <Modal open={welcome} onClose={dismissWelcome} className="max-w-sm text-center" title="">
      <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className="mx-auto -mt-4 grid h-16 w-16 place-items-center rounded-2xl border border-primary/40 bg-primary/15 text-primary glow-primary">
        <PartyPopper className="h-8 w-8" />
      </motion.div>
      <h2 className="mt-5 font-display text-2xl font-bold">You're on Pro</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Payment confirmed. Every limit is lifted
        {summary?.current_period_end ? <> and your plan renews on <b className="text-foreground">{formatDate(summary.current_period_end)}</b></> : null}.
        A receipt is on its way from Razorpay.
      </p>
      <Button className="mt-6 w-full" onClick={dismissWelcome}>Back to the investigation <ArrowRight className="h-4 w-4" /></Button>
    </Modal>
  );
};
