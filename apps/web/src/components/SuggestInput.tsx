import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type SuggestOption = {
  value: string;
  label: string;
  hint?: string;
};

type Props = {
  id?: string;
  value: string;
  displayValue?: string;
  options: SuggestOption[];
  placeholder?: string;
  /** Allow keeping typed text that is not in the list (feed type). Default true. */
  allowCustom?: boolean;
  /** Min characters before showing suggestions. Default 1. */
  minChars?: number;
  disabled?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  onChange: (next: { value: string; label: string; option?: SuggestOption }) => void;
  onInputChange?: (text: string) => void;
};

function normalize(s: string) {
  return s.trim().toLowerCase();
}

export function SuggestInput({
  id,
  value,
  displayValue,
  options,
  placeholder,
  allowCustom = true,
  minChars = 1,
  disabled,
  onChange,
  onInputChange,
  ...aria
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(displayValue ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (displayValue != null) setText(displayValue);
  }, [displayValue]);

  useEffect(() => {
    if (!value) return;
    const match = options.find((o) => o.value === value);
    if (match && !text) setText(match.label);
  }, [options, text, value]);

  const filtered = useMemo(() => {
    const q = normalize(text);
    if (q.length < minChars) return [];
    return options
      .filter((o) => {
        const hay = normalize(`${o.label} ${o.hint ?? ''} ${o.value}`);
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [minChars, options, text]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (option: SuggestOption) => {
    setText(option.label);
    setOpen(false);
    onChange({ value: option.value, label: option.label, option });
  };

  const commitCustom = () => {
    if (!allowCustom) return;
    const trimmed = text.trim();
    if (!trimmed) {
      onChange({ value: '', label: '' });
      return;
    }
    const exact = options.find((o) => normalize(o.label) === normalize(trimmed));
    if (exact) {
      pick(exact);
      return;
    }
    onChange({ value: trimmed, label: trimmed });
  };

  return (
    <div className="suggest" ref={wrapRef}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && filtered.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        {...aria}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          setOpen(true);
          setActive(0);
          onInputChange?.(next);
          if (allowCustom) {
            onChange({ value: next, label: next });
          } else if (!next.trim()) {
            onChange({ value: '', label: '' });
          }
        }}
        onBlur={() => {
          // Delay so option click can fire first.
          window.setTimeout(() => {
            if (!allowCustom && value) {
              const match = options.find((o) => o.value === value);
              if (match) setText(match.label);
            } else if (!allowCustom) {
              commitCustom();
            }
          }, 120);
        }}
        onKeyDown={(e) => {
          if (!open || filtered.length === 0) {
            if (e.key === 'Enter') commitCustom();
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const hit = filtered[active];
            if (hit) pick(hit);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 ? (
        <ul id={listId} className="suggest-list" role="listbox">
          {filtered.map((option, index) => (
            <li key={`${option.value}-${option.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? 'suggest-option active' : 'suggest-option'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
              >
                <span>{option.label}</span>
                {option.hint ? <span className="suggest-hint">{option.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
