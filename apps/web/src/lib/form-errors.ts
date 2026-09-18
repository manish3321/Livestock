import { useCallback, useState } from 'react';

export type FieldErrors = Record<string, string>;

export interface FieldErrorsApi {
  errors: FieldErrors;
  /** Runs the rules; returns true when the form is clean and focuses the first bad field otherwise. */
  validate: (rules: FieldErrors) => boolean;
  clearField: (field: string) => void;
  reset: () => void;
  fieldProps: (field: string) => {
    'aria-invalid'?: true;
    'aria-describedby'?: string;
    id: string;
  };
}

export function useFieldErrors(prefix: string): FieldErrorsApi {
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = useCallback(
    (rules: FieldErrors) => {
      const found = Object.fromEntries(Object.entries(rules).filter(([, message]) => Boolean(message)));
      setErrors(found);
      const firstField = Object.keys(found)[0];
      if (!firstField) return true;
      window.requestAnimationFrame(() => {
        const node = document.getElementById(`${prefix}-${firstField}`);
        node?.focus();
        node?.scrollIntoView({ block: 'nearest' });
      });
      return false;
    },
    [prefix],
  );

  const clearField = useCallback((field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const reset = useCallback(() => setErrors({}), []);

  const fieldProps = useCallback(
    (field: string) => ({
      id: `${prefix}-${field}`,
      ...(errors[field]
        ? { 'aria-invalid': true as const, 'aria-describedby': `${prefix}-${field}-error` }
        : {}),
    }),
    [errors, prefix],
  );

  return { errors, validate, clearField, reset, fieldProps };
}

/** True when the value is empty after trimming. */
export function required(value: string | null | undefined, message: string): string {
  return value && String(value).trim() ? '' : message;
}

export function notFuture(value: Date | null, message: string): string {
  if (!value || Number.isNaN(value.getTime())) return '';
  return value.getTime() > Date.now() ? message : '';
}

export function inRange(
  value: string,
  min: number,
  max: number,
  message: string,
): string {
  if (!value.trim()) return '';
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return message;
  return '';
}
