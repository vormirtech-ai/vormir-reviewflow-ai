// The design system: small, accessible building blocks styled with the tokens in styles/index.css.
import { AlertTriangle, Loader2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-paper text-ink hover:bg-white',
  secondary: 'border border-line-strong text-paper hover:bg-raised',
  ghost: 'text-silver hover:bg-raised hover:text-paper',
  danger: 'border border-danger/50 text-danger hover:bg-danger/10',
};

export function buttonClass(variant: Variant = 'primary', size: 'sm' | 'md' = 'md'): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
    VARIANTS[variant],
  );
}

export function Button({ variant, size, loading, className, children, ...props }: ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button type="button" {...props} disabled={props.disabled || loading} aria-busy={loading || undefined} className={cx(buttonClass(variant, size), className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block text-sm', className)}>
      <span className="mb-1.5 block font-medium text-silver">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

export const Input = ({ className, ...props }: ComponentProps<'input'>) => <input {...props} className={cx('control', className)} />;
export const Textarea = ({ className, ...props }: ComponentProps<'textarea'>) => <textarea rows={3} {...props} className={cx('control', className)} />;
export const Select = ({ className, ...props }: ComponentProps<'select'>) => <select {...props} className={cx('control', className)} />;

export function Checkbox({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-silver">
      <input type="checkbox" {...props} className="size-4 accent-white" />
      {label}
    </label>
  );
}

export const Card = ({ className, ...props }: ComponentProps<'section'>) => (
  <section {...props} className={cx('rounded-card border border-line bg-surface p-5 shadow-card', className)} />
);

const TONES = {
  neutral: 'border-line-strong text-silver',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
  danger: 'border-danger/40 text-danger',
};
export const Badge = ({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs capitalize', TONES[tone])}>{children}</span>
);
export const statusTone = (status: string) => (status === 'published' || status === 'active' ? 'success' : status === 'draft' ? 'warning' : 'neutral');

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('skeleton', className)} />;

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
      <Icon className="mb-3 size-8 text-muted" aria-hidden />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-card border border-danger/30 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 size-8 text-danger" aria-hidden />
      <h3 className="text-base font-semibold">Something went wrong</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{message || 'Please try again in a moment.'}</p>
      {onRetry && <Button variant="secondary" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Native <dialog>: focus trapping, Escape and the backdrop come from the platform. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className="m-auto w-[min(92vw,32rem)] rounded-card border border-line bg-surface p-6 text-paper">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {open && children}
    </dialog>
  );
}

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto rounded-card border border-line">
    <table className="w-full min-w-[36rem] text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_th]:bg-surface [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted">
      {children}
    </table>
  </div>
);
