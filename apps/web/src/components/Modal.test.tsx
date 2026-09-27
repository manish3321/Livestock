import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';
import '../i18n';

describe('Modal', () => {
  it('portals outside a transformed ancestor so the backdrop stays anchored to the viewport', () => {
    const { container } = render(
      <div style={{ transform: 'translateY(0)' }}>
        <Modal open onClose={() => {}} title="Heat">
          <p>body</p>
        </Modal>
      </div>,
    );

    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('closes on Escape and on a backdrop click, but not on a click inside the sheet', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Heat">
        <p>body</p>
      </Modal>,
    );

    fireEvent.click(screen.getByText('body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('restores body scrolling when it unmounts', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Heat">
        <p>body</p>
      </Modal>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
