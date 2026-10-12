import type { Interval, Limits, Metric, Plans } from './api';
import { BRAND } from './brand';

/** Shown until /api/billing/plans answers, and if it can't be reached. Mirrors the backend defaults. */
export const DEFAULT_PLANS: Plans = {
  enabled: false,
  key_id: null,
  currency: 'INR',
  monthly: { price: 2900 },
  yearly: { price: 20000, per_month: 1667, savings: 14800, savings_pct: 42 },
  free_limits: { cases: 2, messages: 30, uploads: 5, briefs: 2 },
  pro_limits: { cases: 1000, messages: 3000, uploads: 1000, briefs: 300 },
};

export const METRIC_LABEL: Record<Metric, string> = {
  cases: 'Cases',
  messages: 'AI questions',
  uploads: 'Evidence uploads',
  briefs: 'Case briefs',
};

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (amount: number) => inr.format(amount);

/** Meter colour: amber normally, orange near the limit, red when spent. */
export const usageTone = (used: number, limit: number) =>
  used >= limit ? 'bg-destructive' : used / Math.max(1, limit) >= 0.8 ? 'bg-orange-500' : 'bg-primary';

export const priceFor = (plans: Plans, interval: Interval) =>
  interval === 'monthly' ? plans.monthly.price : plans.yearly.price;

export const freeFeatures = (l: Limits) => [
  `${l.cases} active cases`,
  `${l.messages} AI questions / month`,
  `${l.uploads} evidence uploads / month`,
  `${l.briefs} AI case briefs / month`,
  'Evidence board & timeline',
];

export const proFeatures = [
  'Unlimited cases',
  `Unlimited ${BRAND.assistant} analysis*`,
  'Documents, PDFs & scene photos',
  'Unlimited AI case briefs & suspect scoring',
  'Court-ready case file export',
  'SHA-256 chain of custody & audit trail',
  'Priority AI processing',
];

export const agencyFeatures = [
  'Everything in Pro, for every officer',
  'On-premise or air-gapped deployment',
  'SSO & role-based access',
  'Data residency in India',
  'Dedicated onboarding & training',
  'Invoice billing & PO support',
];

// ---------------------------------------------------------- Razorpay Checkout

export interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, cb: (resp: { error?: { description?: string } }) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loader: Promise<void> | null = null;

/** Loads checkout.js on first use only, so visitors who never pay never download it. */
export function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null;
      reject(new Error('Could not load the payment window. Check your connection or disable ad-blockers and try again.'));
    };
    document.body.appendChild(script);
  });
  return loader;
}

export type { RazorpayInstance };
