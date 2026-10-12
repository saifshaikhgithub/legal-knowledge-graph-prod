import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { Logo } from '../ui/Logo';
import { useAuth } from '../../lib/AuthContext';
import { BRAND, COMPANY } from '../../lib/brand';

/** Public-site navigation. `home` links to sections of the landing page with plain anchors. */
export const SiteHeader = ({ home = false }: { home?: boolean }) => {
  const { isAuthenticated } = useAuth();
  const section = (id: string) => (home ? `#${id}` : `/#${id}`);
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/"><Logo /></Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href={section('features')} className="hover:text-foreground">Platform</a>
          <a href={section('how')} className="hover:text-foreground">How it works</a>
          <a href={section('trust')} className="hover:text-foreground">Security</a>
          <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Link to="/app"><Button size="sm">Open workspace <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
          ) : (
            <>
              <Link to="/login" className="hidden sm:block"><Button size="sm" variant="ghost">Sign in</Button></Link>
              <Link to="/register"><Button size="sm">Start free</Button></Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

const footerLinks = [
  ['Pricing', '/pricing'],
  ['Contact', '/contact'],
  ['Terms', '/terms'],
  ['Privacy', '/privacy'],
  ['Refunds', '/refunds'],
  ['Delivery', '/shipping'],
] as const;

export const SiteFooter = () => (
  <footer className="border-t py-10">
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 text-xs text-muted-foreground sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <Logo compact />
        <span className="font-mono">© {new Date().getFullYear()} {COMPANY.legalName}</span>
      </div>
      <nav className="flex flex-wrap gap-x-5 gap-y-2">
        {footerLinks.map(([label, to]) => (
          <Link key={to} to={to} className="hover:text-foreground">{label}</Link>
        ))}
      </nav>
    </div>
    <p className="mx-auto mt-6 max-w-7xl px-4 text-[11px] text-muted-foreground/80 sm:px-6">
      {BRAND.name} provides AI-assisted analysis. All findings must be independently verified by a qualified investigator.
    </p>
  </footer>
);
