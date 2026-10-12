/**
 * Plan, usage and checkout state shared across the app.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setPaymentRequiredHandler, type BillingSummary, type Interval, type Paywall, type Plans } from './api';
import { useAuth } from './AuthContext';
import { DEFAULT_PLANS, loadRazorpay, type RazorpayResponse } from './billing';
import { COMPANY } from './brand';

interface BillingContextType {
  plans: Plans;
  summary: BillingSummary | null;
  isPro: boolean;
  refresh: () => Promise<void>;
  /** The upgrade dialog; `paywall` explains which limit was hit, when it was opened by one. */
  upgrade: { open: boolean; paywall: Paywall | null };
  openUpgrade: (paywall?: Paywall | null) => void;
  closeUpgrade: () => void;
  checkout: (interval: Interval) => Promise<boolean>;
  checkoutBusy: boolean;
  checkoutError: string;
  welcome: boolean;
  dismissWelcome: () => void;
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

export const BillingProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plans>(DEFAULT_PLANS);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [upgrade, setUpgrade] = useState<{ open: boolean; paywall: Paywall | null }>({ open: false, paywall: null });
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [welcome, setWelcome] = useState(false);

  useEffect(() => {
    api.getPlans().then(setPlans).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    try { setSummary(await api.getBilling()); } catch { /* keep the last known state */ }
  }, []);

  useEffect(() => {
    if (user) refresh();
    else setSummary(null);
  }, [user, refresh]);

  const openUpgrade = useCallback((paywall: Paywall | null = null) => {
    setCheckoutError('');
    setUpgrade({ open: true, paywall });
  }, []);
  const closeUpgrade = useCallback(() => setUpgrade((u) => ({ ...u, open: false })), []);

  // Any request the plan doesn't cover opens the upgrade dialog, wherever it came from.
  useEffect(() => {
    setPaymentRequiredHandler((info) => {
      openUpgrade(info);
      refresh();
    });
    return () => setPaymentRequiredHandler(null);
  }, [openUpgrade, refresh]);

  const checkout = useCallback(async (interval: Interval): Promise<boolean> => {
    setCheckoutBusy(true);
    setCheckoutError('');
    try {
      if (!plans.enabled) {
        throw new Error(`Online payments are opening soon. Email ${COMPANY.salesEmail} to start Pro today.`);
      }
      const [session] = await Promise.all([api.subscribe(interval), loadRazorpay()]);
      const result = await new Promise<RazorpayResponse | null>((resolve) => {
        const Razorpay = window.Razorpay!;
        const rzp = new Razorpay({
          key: session.key_id,
          subscription_id: session.subscription_id,
          name: session.product,
          description: `Pro plan · billed ${interval}`,
          prefill: { name: user?.full_name || '', email: user?.email || '' },
          theme: { color: '#F59E0B' },
          handler: (resp: RazorpayResponse) => resolve(resp),
          modal: { ondismiss: () => resolve(null), confirm_close: true },
        });
        // Razorpay keeps its window open after a failed attempt so the customer can retry another method.
        rzp.on('payment.failed', (r) => setCheckoutError(r.error?.description || 'The payment did not go through.'));
        rzp.open();
      });
      if (!result) return false;
      setSummary(await api.verifyPayment(result));
      setCheckoutError('');
      setUpgrade({ open: false, paywall: null });
      setWelcome(true);
      return true;
    } catch (e) {
      setCheckoutError((e as Error).message);
      return false;
    } finally {
      setCheckoutBusy(false);
    }
  }, [plans.enabled, user]);

  return (
    <BillingContext.Provider value={{
      plans, summary, isPro: summary?.plan === 'pro', refresh,
      upgrade, openUpgrade, closeUpgrade,
      checkout, checkoutBusy, checkoutError,
      welcome, dismissWelcome: () => setWelcome(false),
    }}>
      {children}
    </BillingContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useBilling = (): BillingContextType => {
  const context = useContext(BillingContext);
  if (!context) throw new Error('useBilling must be used within a BillingProvider');
  return context;
};
