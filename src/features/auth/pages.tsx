import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../../app/shell.tsx';
import { Logo } from '../../components/brand.tsx';
import { errorMessage } from '../../components/toast.tsx';
import { Button, Card, Field, Input } from '../../components/ui.tsx';
import { api } from '../../lib/api.ts';
import { isDemo } from '../../lib/env.ts';

function AuthFrame({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link to="/" aria-label="Home"><Logo className="mb-6 h-12 w-48" /></Link>
      <Card className="w-full max-w-sm">
        <h1 className="mb-5 text-xl font-semibold">{title}</h1>
        {children}
      </Card>
      {footer && <p className="mt-5 text-sm text-muted">{footer}</p>}
      {isDemo && <p className="mt-3 max-w-sm text-center text-xs text-warning">Demo mode: accounts live only in this browser and passwords are not checked. Use demo@example.com for sample data.</p>}
    </main>
  );
}

const FormError = ({ message }: { message: string }) => (message ? <p role="alert" className="text-sm text-danger">{message}</p> : null);
const linkClass = 'text-paper underline underline-offset-4';

const email = z.email('Enter a valid email address');
const password = z.string().min(8, 'Use at least 8 characters').max(72);

const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });

export function LoginPage() {
  const { user } = useAuth();
  const location = useLocation();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={(location.state as { from?: string } | null)?.from ?? '/app/dashboard'} replace />;
  return (
    <AuthFrame title="Log in" footer={<>New here? <Link className={linkClass} to="/signup">Create an account</Link></>}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
        setError('');
        try { await api.signIn(v.email, v.password); } catch (e) { setError(errorMessage(e)); }
      })}>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message}><Input type="password" autoComplete="current-password" {...register('password')} /></Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Log in</Button>
        <p className="text-center text-sm"><Link className="text-muted underline underline-offset-4" to="/forgot-password">Forgot your password?</Link></p>
      </form>
    </AuthFrame>
  );
}

const signupSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(120),
  organizationName: z.string().trim().min(1, 'Enter your company or organization name').max(120),
  email,
  password,
});

export function SignupPage() {
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(signupSchema) });
  if (user) return <Navigate to="/app/dashboard" replace />;
  if (confirm) {
    return (
      <AuthFrame title="Check your email" footer={<Link className={linkClass} to="/login">Back to log in</Link>}>
        <p className="text-sm text-silver">We sent a confirmation link to your email address. Open it to verify your account, then log in.</p>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title="Create your account" footer={<>Already registered? <Link className={linkClass} to="/login">Log in</Link></>}>
      <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
        setError('');
        try { setConfirm((await api.signUp(v)).needsEmailConfirmation); } catch (e) { setError(errorMessage(e)); }
      })}>
        <Field label="Your name" error={errors.fullName?.message}><Input autoComplete="name" {...register('fullName')} /></Field>
        <Field label="Organization name" error={errors.organizationName?.message}><Input autoComplete="organization" {...register('organizationName')} /></Field>
        <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
        <Field label="Password" error={errors.password?.message} hint="At least 8 characters."><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
        <FormError message={error} />
        <Button type="submit" className="w-full" loading={isSubmitting}>Create account</Button>
        <p className="text-xs text-muted">By creating an account you agree to the <Link className="underline" to="/terms">Terms</Link> and <Link className="underline" to="/privacy">Privacy notice</Link>.</p>
      </form>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ email })) });
  return (
    <AuthFrame title="Reset your password" footer={<Link className={linkClass} to="/login">Back to log in</Link>}>
      {sent
        ? <p className="text-sm text-silver">If an account exists for that address, a reset link is on its way. The link opens a page where you can choose a new password.</p>
        : (
          <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
            setError('');
            try { await api.requestPasswordReset(v.email); setSent(true); } catch (e) { setError(errorMessage(e)); }
          })}>
            <Field label="Email" error={errors.email?.message}><Input type="email" autoComplete="email" {...register('email')} /></Field>
            <FormError message={error} />
            <Button type="submit" className="w-full" loading={isSubmitting}>Send reset link</Button>
          </form>
        )}
    </AuthFrame>
  );
}

/** Landing page for email confirmation and password recovery links. */
export function AuthCallbackPage() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState('');
  const recovery = params.get('type') === 'recovery';
  const linkError = params.get('error_description') ?? new URLSearchParams(window.location.hash.slice(1)).get('error_description');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(z.object({ password })) });

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (user && !recovery) return <Navigate to="/app/dashboard" replace />;
  if (user && recovery) {
    return (
      <AuthFrame title="Choose a new password">
        <form noValidate className="space-y-4" onSubmit={handleSubmit(async (v) => {
          setError('');
          try { await api.updatePassword(v.password); navigate('/app/dashboard', { replace: true }); } catch (e) { setError(errorMessage(e)); }
        })}>
          <Field label="New password" error={errors.password?.message}><Input type="password" autoComplete="new-password" {...register('password')} /></Field>
          <FormError message={error} />
          <Button type="submit" className="w-full" loading={isSubmitting}>Save password</Button>
        </form>
      </AuthFrame>
    );
  }
  if (linkError || (!loading && timedOut)) {
    return (
      <AuthFrame title="This link did not work" footer={<Link className={linkClass} to="/login">Go to log in</Link>}>
        <p className="text-sm text-silver">{linkError ?? 'The link may have expired or already been used. Request a new one and try again.'}</p>
      </AuthFrame>
    );
  }
  return <AuthFrame title="Signing you in…"><p role="status" className="text-sm text-muted">One moment.</p></AuthFrame>;
}
