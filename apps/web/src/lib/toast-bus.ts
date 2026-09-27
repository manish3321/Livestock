export type ToastKind = 'success' | 'error' | 'info';

export interface ToastRequest {
  kind: ToastKind;
  /** i18n key, resolved by the provider so non-React callers stay language-agnostic. */
  key?: string;
  text?: string;
}

type Listener = (toast: ToastRequest) => void;

const listeners = new Set<Listener>();

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishToast(toast: ToastRequest): void {
  for (const listener of listeners) listener(toast);
}
