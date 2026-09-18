import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider } from './Toast';
import { publishToast } from '../lib/toast-bus';
import '../i18n';

describe('ToastProvider', () => {
  it('renders a translated toast published from outside React', async () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );

    act(() => publishToast({ kind: 'success', key: 'common.saved' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows raw text for errors that already carry a message', async () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );

    act(() => publishToast({ kind: 'error', text: 'Cow not found' }));

    expect(await screen.findByText('Cow not found')).toBeInTheDocument();
  });
});
