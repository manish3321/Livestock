import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let openCount = 0;

/**
 * Portals to document.body so no transformed ancestor can capture the fixed
 * backdrop and push the dialog off screen.
 */
export function Modal({
  open,
  onClose,
  title,
  kicker,
  label,
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  kicker?: ReactNode;
  label?: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusTo.current = document.activeElement as HTMLElement | null;

    openCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    // Let the sheet render before reaching for its first field.
    const focusTimer = window.setTimeout(() => {
      const nodes = sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      const preferred = sheetRef.current?.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? nodes?.[0])?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      openCount -= 1;
      if (openCount === 0) document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className={`modal-sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || kicker) && (
          <div className="modal-sheet-header">
            <div>
              {kicker && <p className="sheet-kicker">{kicker}</p>}
              {title && <h2>{title}</h2>}
            </div>
            <button className="btn secondary" type="button" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        )}
        <div className="modal-sheet-body">{children}</div>
        {footer && <div className="modal-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive = true,
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title ?? t('common.confirmTitle')}
      label={title ?? t('common.confirmTitle')}
      className="confirm-sheet"
      footer={
        <div className="sheet-actions">
          <button className="btn secondary" type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            className={`btn${destructive ? ' danger' : ''}`}
            type="button"
            data-autofocus
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending ? t('common.saving') : (confirmLabel ?? t('common.delete'))}
          </button>
        </div>
      }
    >
      <p>{message}</p>
    </Modal>
  );
}

/** Delete button that carries its own confirmation dialog. */
export function DeleteButton({
  message,
  pending = false,
  onConfirm,
  label,
  className = 'btn secondary danger',
}: {
  message: string;
  pending?: boolean;
  onConfirm: () => void;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={pending} onClick={() => setAsking(true)}>
        {label ?? t('common.delete')}
      </button>
      <ConfirmDialog
        open={asking}
        message={message}
        pending={pending}
        onConfirm={() => {
          setAsking(false);
          onConfirm();
        }}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
