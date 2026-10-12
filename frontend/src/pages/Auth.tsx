import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, Fingerprint, Loader2, Network, ShieldCheck } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input, Label } from '../components/ui/Input';
import { Logo } from '../components/ui/Logo';
import { NetworkBackground } from '../components/NetworkBackground';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';
import { BRAND } from '../lib/brand';

const AuthShell = ({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) => (
  <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
    <aside className="relative hidden overflow-hidden border-r bg-surface lg:block">
      <div className="absolute inset-0 grid-bg" />
      <NetworkBackground className="absolute inset-0 h-full w-full opacity-80" density={0.00016} />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
      <div className="relative flex h-full flex-col justify-between p-10">
        <Link to="/"><Logo /></Link>
        <div className="max-w-md">
          <div className="tape mb-6 h-1.5 w-24 rounded-full" />
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight">
            The case file that <span className="text-gradient">thinks back.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-muted-foreground">
            {[
              [Network, 'Live evidence graph and timeline from every document'],
              [Fingerprint, 'SHA-256 chain of custody on every evidence file'],
              [ShieldCheck, 'Full audit trail, deployable on your own servers'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Network;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary"><I className="h-4 w-4" /></span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">RESTRICTED · AUTHORIZED PERSONNEL ONLY</p>
      </div>
    </aside>

    <main className="flex items-center justify-center px-4 py-12 sm:px-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <Link to="/" className="mb-10 inline-block lg:hidden"><Logo /></Link>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </motion.div>
    </main>
  </div>
);

const ErrorNote = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{message}</span>
  </div>
);

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/app');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle={`Sign in to your ${BRAND.name} workspace.`}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="detective@agency.gov" value={email}
                 onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" value={password}
                 onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to {BRAND.name}? <Link to="/register" className="font-medium text-primary hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
};

export const Register = () => {
  const [form, setForm] = useState({ full_name: '', organization: '', badge_role: '', email: '', password: '', confirm: '', invite_code: '' });
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  // Chosen on the pricing page: go straight to checkout after sign-up.
  const plan = new URLSearchParams(window.location.search).get('plan');
  const afterSignup = plan === 'monthly' || plan === 'yearly' ? `/app/billing?checkout=${plan}` : '/app';

  useEffect(() => {
    api.authConfig().then((c) => setInviteRequired(c.invite_required)).catch(() => {});
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        full_name: form.full_name,
        organization: form.organization,
        badge_role: form.badge_role,
        invite_code: form.invite_code || undefined,
      });
      navigate(afterSignup);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Request access" subtitle="Set up your investigator account.">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorNote message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input id="full_name" placeholder="Det. Jane Morgan" value={form.full_name} onChange={set('full_name')} autoFocus />
          </div>
          <div>
            <Label htmlFor="organization">Agency</Label>
            <Input id="organization" placeholder="Metro PD" value={form.organization} onChange={set('organization')} />
          </div>
          <div>
            <Label htmlFor="badge_role">Role</Label>
            <Input id="badge_role" placeholder="Homicide" value={form.badge_role} onChange={set('badge_role')} />
          </div>
        </div>
        <div>
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="detective@agency.gov" value={form.email} onChange={set('email')} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="new-password" placeholder="8+ characters" value={form.password} onChange={set('password')} required />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm</Label>
            <Input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••" value={form.confirm} onChange={set('confirm')} required />
          </div>
        </div>
        {inviteRequired && (
          <div>
            <Label htmlFor="invite">Agency invite code</Label>
            <Input id="invite" placeholder="Provided by your administrator" value={form.invite_code} onChange={set('invite_code')} required />
          </div>
        )}
        <Button type="submit" className="w-full" size="lg" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</> : <>Create account <ArrowRight className="h-4 w-4" /></>}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have access? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
};
