import { Component, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { buttonClass, cx, ErrorState } from './ui.tsx';

/**
 * The supplied Vormir Tech Solutions logo is a square image with wide black margins.
 * It is cropped (never stretched) to the wordmark, so its proportions stay intact.
 */
export function Logo({ className = 'h-10 w-40' }: { className?: string }) {
  return (
    <span className={cx('block shrink-0 overflow-hidden', className)}>
      <img src="/vormir-logo.jpg" alt="Vormir Tech Solutions" width={160} height={40} className="h-full w-full object-cover" style={{ objectPosition: 'center 50.5%', transform: 'scale(1.3)' }} />
    </span>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-3" aria-label="Vormir ReviewFlow AI home">
      <Logo />
      <span className="hidden border-l border-line pl-3 text-sm font-medium text-silver sm:block">ReviewFlow AI</span>
    </Link>
  );
}

function StatusPage({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo className="mb-8 h-12 w-48" />
      <p className="eyebrow">{code}</p>
      <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted">{body}</p>
      <Link to="/" className={cx(buttonClass('secondary'), 'mt-6')}>Back to home</Link>
    </main>
  );
}
export const NotFound = () => <StatusPage code="404" title="Page not found" body="The page you are looking for does not exist or has moved." />;
export const Unauthorized = () => <StatusPage code="403" title="No access" body="Your account does not have permission to view this page. Ask an organization owner for access." />;

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-lg px-6 py-24">
        <ErrorState message="This page hit an unexpected error. Reloading usually fixes it." onRetry={() => window.location.reload()} />
      </main>
    );
  }
}
