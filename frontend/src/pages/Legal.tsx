import type { ReactNode } from 'react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { SiteFooter, SiteHeader } from '../components/site/SiteChrome';
import { useBilling } from '../lib/BillingContext';
import { formatINR } from '../lib/billing';
import { BRAND, COMPANY } from '../lib/brand';

export type LegalPage = 'terms' | 'privacy' | 'refunds' | 'shipping' | 'contact';

const Shell = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="min-h-full bg-background">
    <SiteHeader />
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6">
      <div className="label-mono mb-3 !text-primary">Legal</div>
      <h1 className="font-display text-4xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 font-mono text-xs text-muted-foreground">Last updated {COMPANY.lastUpdated}</p>
      <div className="prose-intel mt-10 space-y-5 text-[15px] leading-relaxed text-foreground/85 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
        {children}
      </div>
    </main>
    <SiteFooter />
  </div>
);

const Email = ({ to }: { to: string }) => <a href={`mailto:${to}`} className="text-primary hover:underline">{to}</a>;

const Terms = () => {
  const { plans } = useBilling();
  return (
    <Shell title="Terms of Service">
      <p>These terms govern your use of {BRAND.name} (the "Service"), operated by {COMPANY.legalName} ("we", "us"). By creating an account you agree to them.</p>
      <h2>1. The Service</h2>
      <p>{BRAND.name} is an AI-assisted case analysis tool. It organises information you provide into an evidence graph, timeline and written analysis. The Service provides analytical assistance only. It does not give legal advice, and it does not replace the judgement of a qualified investigator. You are responsible for independently verifying every output before relying on it in any operational, legal or judicial decision.</p>
      <h2>2. Accounts</h2>
      <p>You must give accurate registration details and keep your password confidential. You are responsible for all activity under your account. You must be legally authorised to handle any case material you upload.</p>
      <h2>3. Plans and billing</h2>
      <ul>
        <li>The Free plan has the monthly limits shown on the pricing page.</li>
        <li>Pro costs {formatINR(plans.monthly.price)} per month or {formatINR(plans.yearly.price)} per year. Payment is in advance, through our payment partner Razorpay.</li>
        <li>Subscriptions renew automatically at the end of each billing period until you cancel. You can cancel at any time from Plan &amp; billing. Cancellation stops future renewals, and Pro access continues until the end of the paid period.</li>
        <li>We may change prices with at least 30 days' notice. Changes take effect from your next renewal.</li>
        <li>Pro features are subject to the fair-use limits described on the pricing page.</li>
      </ul>
      <h2>4. Acceptable use</h2>
      <p>You may not use the Service to profile people based on protected characteristics, to harass or surveil individuals without lawful authority, to process data you have no right to process, or to attempt to disrupt, reverse-engineer or overload the Service.</p>
      <h2>5. Your data</h2>
      <p>You keep ownership of everything you upload. You grant us a limited licence to process it solely to provide the Service. Our <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a> explains how we handle it.</p>
      <h2>6. Availability and liability</h2>
      <p>We work to keep the Service available and accurate, but it is provided "as is". AI outputs can be incomplete or wrong. To the extent permitted by law, our total liability for any claim is limited to the amount you paid us in the 12 months before the claim.</p>
      <h2>7. Termination</h2>
      <p>You may close your account at any time. We may suspend accounts that breach these terms. On termination you may request an export of your case data within 30 days.</p>
      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of {COMPANY.jurisdiction}. Contact: <Email to={COMPANY.supportEmail} />.</p>
    </Shell>
  );
};

const Privacy = () => (
  <Shell title="Privacy Policy">
    <p>This policy explains what {COMPANY.legalName} collects when you use {BRAND.name}, and how it is used.</p>
    <h2>What we collect</h2>
    <ul>
      <li><b>Account data:</b> name, email, agency, role and a securely hashed password.</li>
      <li><b>Case content:</b> messages, documents and images you upload, and the analysis generated from them.</li>
      <li><b>Billing data:</b> plan, subscription status and payment references. Card, UPI and bank details are collected and stored by Razorpay, never by us.</li>
      <li><b>Security logs:</b> sign-ins, exports and case changes, recorded in an audit log.</li>
    </ul>
    <h2>How we use it</h2>
    <p>We use your data only to provide and secure the Service, process payments, provide support and meet legal obligations. We do not sell personal data. We do not use your case content for advertising.</p>
    <h2>AI processing</h2>
    <p>To generate analysis, case content is sent to the AI model provider configured for the Service, and processed only to return results to you. Agency customers can run the models inside their own infrastructure, so case data never leaves their network.</p>
    <h2>Sharing</h2>
    <p>We share data only with service providers who need it to run the Service: hosting, database, AI inference and Razorpay for payments. We also share data when the law requires it.</p>
    <h2>Retention and your rights</h2>
    <p>We keep your data while your account is active. You can delete cases at any time. You can ask to access, correct or delete your personal data by emailing <Email to={COMPANY.supportEmail} />. We handle personal data in line with India's Digital Personal Data Protection Act, 2023.</p>
    <h2>Security</h2>
    <p>Data is encrypted in transit, passwords are hashed with bcrypt, and evidence files are fingerprinted with SHA-256 for chain of custody.</p>
  </Shell>
);

const Refunds = () => (
  <Shell title="Cancellation & Refund Policy">
    <h2>Cancellation</h2>
    <p>You can cancel your Pro subscription at any time from <b>Plan &amp; billing</b>. Cancelling stops all future charges. You keep Pro access until the end of the billing period you have already paid for. After that your account moves to the Free plan, and your cases and evidence are kept.</p>
    <h2>Refunds</h2>
    <ul>
      <li><b>First payment:</b> if you are not satisfied, email us within 7 days of your first Pro payment for a full refund.</li>
      <li><b>Renewals:</b> renewal charges are not refundable, but you can cancel at any time to prevent the next one.</li>
      <li><b>Duplicate or failed charges:</b> if you are charged twice or charged for a payment that failed, we refund the extra amount in full.</li>
    </ul>
    <p>Approved refunds are issued to the original payment method through Razorpay, usually within 5 to 7 business days. To request one, email <Email to={COMPANY.supportEmail} /> from your account email with the payment reference shown under Plan &amp; billing.</p>
  </Shell>
);

const Shipping = () => (
  <Shell title="Delivery Policy">
    <p>{BRAND.name} is a software service delivered online. Nothing is physically shipped.</p>
    <p>Pro features are activated on your account as soon as your payment is confirmed, normally within seconds. If your plan has not upgraded within 30 minutes of a successful payment, contact <Email to={COMPANY.supportEmail} /> with your payment reference and we will activate it manually.</p>
  </Shell>
);

const Contact = () => (
  <Shell title="Contact us">
    <p>We usually reply within one business day.</p>
    <div className="grid gap-4 pt-2 sm:grid-cols-2">
      <div className="rounded-2xl border bg-surface p-5">
        <Mail className="h-5 w-5 text-primary" />
        <div className="mt-3 font-semibold text-foreground">Support &amp; billing</div>
        <Email to={COMPANY.supportEmail} />
      </div>
      <div className="rounded-2xl border bg-surface p-5">
        <Mail className="h-5 w-5 text-ai" />
        <div className="mt-3 font-semibold text-foreground">Agency &amp; government sales</div>
        <Email to={COMPANY.salesEmail} />
      </div>
      {COMPANY.phone && (
        <div className="rounded-2xl border bg-surface p-5">
          <Phone className="h-5 w-5 text-primary" />
          <div className="mt-3 font-semibold text-foreground">Phone</div>
          <a href={`tel:${COMPANY.phone}`} className="text-primary hover:underline">{COMPANY.phone}</a>
        </div>
      )}
      {COMPANY.address && (
        <div className="rounded-2xl border bg-surface p-5">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="mt-3 font-semibold text-foreground">Registered address</div>
          <p className="text-sm text-muted-foreground">{COMPANY.legalName}<br />{COMPANY.address}</p>
        </div>
      )}
    </div>
  </Shell>
);

export const Legal = ({ page }: { page: LegalPage }) => {
  switch (page) {
    case 'terms': return <Terms />;
    case 'privacy': return <Privacy />;
    case 'refunds': return <Refunds />;
    case 'shipping': return <Shipping />;
    case 'contact': return <Contact />;
  }
};
