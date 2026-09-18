import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeToasts, type ToastKind, type ToastRequest } from '../lib/toast-bus';

const DISMISS_MS = 3200;
const MAX_VISIBLE = 3;

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastValue {
  notify: (text: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((text: string, kind: ToastKind = 'success') => {
    if (!text) return;
    const id = nextId++;
    setToasts((current) => [...current, { id, kind, text }].slice(-MAX_VISIBLE));
    window.setTimeout(() => {
      setToasts((current) => current.filter((row) => row.id !== id));
    }, DISMISS_MS);
  }, []);

  // Mutations report through the bus so they do not need a React context.
  useEffect(
    () =>
      subscribeToasts((request: ToastRequest) => {
        push(request.text ?? (request.key ? t(request.key) : ''), request.kind);
      }),
    [push, t],
  );

  const value = useMemo<ToastValue>(() => ({ notify: push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
