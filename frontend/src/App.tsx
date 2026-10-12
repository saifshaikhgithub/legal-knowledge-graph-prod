import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from './lib/ThemeContext';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { BillingProvider } from './lib/BillingContext';
import { UpgradeModal, WelcomeProModal } from './components/billing/UpgradeModal';

// Route-level code splitting: the graph engine only loads inside the workspace.
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));
const Login = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Register })));
const Workspace = lazy(() => import('./pages/Workspace').then((m) => ({ default: m.Workspace })));
const Pricing = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.Pricing })));
const Billing = lazy(() => import('./pages/Billing').then((m) => ({ default: m.Billing })));
const Legal = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Legal })));

const FullScreenLoader = () => (
  <div className="grid h-full place-items-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const { search } = useLocation();
  if (isLoading) return <FullScreenLoader />;
  // A plan picked on the pricing page carries through sign-up straight into checkout.
  const plan = new URLSearchParams(search).get('plan');
  const target = plan === 'monthly' || plan === 'yearly' ? `/app/billing?checkout=${plan}` : '/app';
  return isAuthenticated ? <Navigate to={target} replace /> : <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <BillingProvider>
          <Suspense fallback={<FullScreenLoader />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/terms" element={<Legal page="terms" />} />
              <Route path="/privacy" element={<Legal page="privacy" />} />
              <Route path="/refunds" element={<Legal page="refunds" />} />
              <Route path="/shipping" element={<Legal page="shipping" />} />
              <Route path="/contact" element={<Legal page="contact" />} />
              <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
              <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
              <Route path="/app/billing" element={<Protected><Billing /></Protected>} />
              <Route path="/app" element={<Protected><Workspace /></Protected>} />
              <Route path="/app/:caseId" element={<Protected><Workspace /></Protected>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <UpgradeModal />
            <WelcomeProModal />
          </Suspense>
          </BillingProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
