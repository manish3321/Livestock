import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { errorMessage } from './lib/api-error';
import { publishToast } from './lib/toast-bus';
import { applyTheme } from './theme';
import './i18n';
import './styles.css';

applyTheme();

/** Screens that render their own confirmation set `meta: { silent: true }`. */
type MutationMeta = { silent?: boolean; successKey?: string };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
  mutationCache: new MutationCache({
    onSuccess: (_data, _vars, _ctx, mutation) => {
      const meta = mutation.meta as MutationMeta | undefined;
      if (meta?.silent) return;
      publishToast({ kind: 'success', key: meta?.successKey ?? 'common.saved' });
    },
    onError: (error, _vars, _ctx, mutation) => {
      const meta = mutation.meta as MutationMeta | undefined;
      if (meta?.silent) return;
      publishToast({ kind: 'error', text: errorMessage(error) });
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
