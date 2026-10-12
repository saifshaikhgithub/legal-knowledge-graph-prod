import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Crown, Loader2, Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Logo } from '../components/ui/Logo';
import { Modal } from '../components/ui/Modal';
import { IntervalToggle, PlanCards } from '../components/billing/PlanCards';
import { UsageMeters } from '../components/billing/UsageMeters';
import { api, type Interval, type PaymentRecord } from '../lib/api';
import { useBilling } from '../lib/BillingContext';
import { formatINR, priceFor } from '../lib/billing';
import { COMPANY } from '../lib/brand';
import { formatDate } from '../lib/entity';

export const Billing = () => {
  const { plans, summary, isPro, refresh, checkout, checkoutError } = useBilling();
  const [params, setParams] = useSearchParams();
  const [interval, setBillingInterval] = useState<Interval>(params.get('checkout') === 'monthly' ? 'monthly' : 'yearly');
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const autoCheckout = useRef(false);

  useEffect(() => {
    refresh();
    api.getPayments().then(setPayments).catch(() => setPayments([]));
  }, [refresh, isPro]);

  // Arriving from "Get Pro" on the pricing page via sign-up: go straight to checkout once.
  useEffect(() => {
    const wanted = params.get('checkout');
    if (!summary || autoCheckout.current || (wanted !== 'monthly' && wanted !== 'yearly')) return;
    autoCheckout.current = true;
    setParams({}, { replace: true });
    if (summary.plan === 'free') checkout(wanted);
  }, [summary, params, setParams, checkout]);

  const cancel = async () => {
    setCancelling(true);
    setCancelError('');
    try {
      await api.cancelSubscription();
      await refresh();
      setConfirmCancel(false);
    } catch (e) {
      setCancelError((e as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const renewal = summary?.current_period_end ? formatDate(summary.current_period_end) : '';
  const proPrice = summary?.interval ? priceFor(plans, summary.interval) : 0;

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-30 border-b glass">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/app" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to cases
          </Link>
          <Logo compact />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <div>
          <div className="label-mono mb-2">Account</div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Plan &amp; billing</h1>
        </div>

        {!summary ? (
          <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* Current plan */}
            <section className="relative overflow-hidden rounded-2xl border bg-surface p-6 sm:p-7">
              {isPro && <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-ai" />}
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    {isPro && <Crown className="h-5 w-5 text-primary" />}
                    <h2 className="font-display text-2xl font-semibold">{isPro ? 'Pro' : 'Free'}</h2>
                    {isPro && summary.interval && <Badge tone="primary">{summary.interval}</Badge>}
                    {summary.complimentary && <Badge tone="ai">complimentary</Badge>}
                    {summary.cancel_at_period_end && <Badge tone="warning">auto-renew off</Badge>}
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    {!isPro ? 'Limited monthly allowance. Upgrade for unlimited investigations.'
                      : summary.complimentary ? 'Pro access granted by your administrator.'
                      : summary.cancel_at_period_end ? <>Pro until <b className="text-foreground">{renewal}</b>. You won't be charged again.</>
                      : <>Renews <b className="text-foreground">{renewal}</b> · {formatINR(proPrice)}/{summary.interval === 'yearly' ? 'year' : 'month'}</>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {isPro && !summary.complimentary && !summary.cancel_at_period_end && (
                    <Button variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel subscription</Button>
                  )}
                  {(!isPro || summary.cancel_at_period_end) && !summary.complimentary && (
                    <Button onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}>
                      <Crown className="h-4 w-4" /> {isPro ? 'Resubscribe' : 'Upgrade to Pro'}
                    </Button>
                  )}
                </div>
              </div>
              {checkoutError && <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{checkoutError}</p>}
            </section>

            {/* Usage */}
            <section className="rounded-2xl border bg-surface p-6 sm:p-7">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">This month's usage</h2>
                <span className="font-mono text-[11px] text-muted-foreground">resets {formatDate(summary.usage_resets_at)}</span>
              </div>
              <UsageMeters summary={summary} />
            </section>

            {/* Plans */}
            {(!isPro || summary.cancel_at_period_end) && !summary.complimentary && (
              <section id="plans" className="scroll-mt-20">
                <div className="mb-6 flex flex-col items-center gap-4 text-center">
                  <h2 className="font-display text-2xl font-bold tracking-tight">Choose your plan</h2>
                  <IntervalToggle value={interval} onChange={setBillingInterval} savingsPct={plans.yearly.savings_pct} />
                </div>
                <PlanCards interval={interval} />
              </section>
            )}

            {/* Payment history */}
            <section className="rounded-2xl border bg-surface">
              <div className="flex items-center gap-2 border-b px-6 py-4">
                <Receipt className="h-4 w-4 text-primary" />
                <h2 className="font-display text-lg font-semibold">Payment history</h2>
              </div>
              {payments === null ? (
                <div className="grid h-24 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
              ) : payments.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-6 py-3 font-medium">Amount</th>
                        <th className="px-6 py-3 font-medium">Method</th>
                        <th className="px-6 py-3 font-medium">Reference</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="px-6 py-3">{formatDate(p.created_at)}</td>
                          <td className="px-6 py-3 font-medium">{formatINR(p.amount)}</td>
                          <td className="px-6 py-3 uppercase text-muted-foreground">{p.method || '-'}</td>
                          <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{p.id}</td>
                          <td className="px-6 py-3"><Badge tone={p.status === 'captured' ? 'success' : 'neutral'}>{p.status === 'captured' ? 'paid' : p.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              Payments are processed securely by Razorpay. Questions about billing? <a className="text-primary hover:underline" href={`mailto:${COMPANY.supportEmail}`}>{COMPANY.supportEmail}</a>
            </p>
          </>
        )}
      </main>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel your Pro subscription?">
        <p className="text-sm text-muted-foreground">
          Auto-renewal stops now. You keep every Pro feature until <b className="text-foreground">{renewal}</b>, and then your
          account moves to the Free plan. Your cases and evidence are kept.
        </p>
        {cancelError && <p className="mt-4 text-sm text-destructive">{cancelError}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep Pro</Button>
          <Button variant="destructive" onClick={cancel} disabled={cancelling}>
            {cancelling && <Loader2 className="h-4 w-4 animate-spin" />} Cancel subscription
          </Button>
        </div>
      </Modal>
    </div>
  );
};
