import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui.tsx';

type Tone = 'success' | 'error';
type Notify = (message: string, tone?: Tone) => void;
const ToastContext = createContext<Notify>(() => {});

export const useToast = () => useContext(ToastContext);

/** Turns any thrown value into a toast, for use in mutation catch blocks. */
export const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Something went wrong.');

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string; tone: Tone }[]>([]);
  const notify = useCallback<Notify>((message, tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={cx('pointer-events-auto rounded-control border bg-raised px-4 py-2.5 text-sm shadow-card', t.tone === 'error' ? 'border-danger/50 text-danger' : 'border-line-strong text-paper')}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
