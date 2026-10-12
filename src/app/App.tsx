import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary, NotFound } from '../components/brand.tsx';
import { ToastProvider } from '../components/toast.tsx';
import { LoadingBlock } from '../components/ui.tsx';
import { ContactPage, FeaturesPage, HomePage, HowItWorksPage, MarketingLayout, PricingPage, PrivacyPage, TermsPage } from '../routes/marketing.tsx';

// Three bundles: the public site (eager), the customer funnel (tiny), and the account area.
// Charts and PDF tooling load only on the pages that use them.
type Account = typeof import('../routes/account.ts');
const account = <K extends keyof Account>(name: K) =>
  lazy(async () => ({ default: (await import('../routes/account.ts'))[name] as ComponentType }));

const PublicFunnelPage = lazy(() => import('../features/feedback/PublicFunnelPage.tsx'));
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage.tsx'));
const QrAssetsPage = lazy(() => import('../features/qr-assets/QrAssetsPage.tsx'));
const AccountShell = account('AccountShell');
const AppLayout = account('AppLayout');
const LoginPage = account('LoginPage');
const SignupPage = account('SignupPage');
const ForgotPasswordPage = account('ForgotPasswordPage');
const AuthCallbackPage = account('AuthCallbackPage');
const DashboardPage = account('DashboardPage');
const BusinessesPage = account('BusinessesPage');
const BusinessFormPage = account('BusinessFormPage');
const BusinessDetailPage = account('BusinessDetailPage');
const FunnelsPage = account('FunnelsPage');
const FunnelBuilderPage = account('FunnelBuilderPage');
const CustomizationPage = account('CustomizationPage');
const SettingsPage = account('SettingsPage');

export function AppRoutes() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="mx-auto max-w-3xl p-8"><LoadingBlock /></div>}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/features" element={<FeaturesPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>

          <Route path="/f/:slug" element={<PublicFunnelPage />} />

          <Route element={<AccountShell />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="businesses" element={<BusinessesPage />} />
              <Route path="businesses/new" element={<BusinessFormPage />} />
              <Route path="businesses/:id" element={<BusinessDetailPage />} />
              <Route path="businesses/:id/edit" element={<BusinessFormPage />} />
              <Route path="funnels" element={<FunnelsPage />} />
              <Route path="funnels/new" element={<FunnelBuilderPage />} />
              <Route path="funnels/:id" element={<FunnelBuilderPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="qr-assets" element={<QrAssetsPage />} />
              <Route path="customization" element={<CustomizationPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  );
}
