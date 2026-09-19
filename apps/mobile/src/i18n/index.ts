import { en } from './en';
import { ne } from './ne';
import { nativeEn, nativeNe } from './native';

export type Locale = 'en' | 'ne';

export type TVars = Record<string, string | number> & { defaultValue?: string };

type Dict = Record<string, unknown>;

function lookup(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Dict)) {
      return (acc as Dict)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(value: string, vars?: TVars): string {
  if (!vars) return value;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
    vars[name] == null ? '' : String(vars[name]),
  );
}

const dictionaries: Record<Locale, Dict> = {
  en: { ...(en.translation as Dict), native: nativeEn },
  ne: { ...(ne.translation as Dict), native: nativeNe },
};

export function translate(locale: Locale, key: string, vars?: TVars): string {
  const found = lookup(dictionaries[locale], key);
  if (typeof found === 'string') return interpolate(found, vars);
  const fallback = lookup(dictionaries.en, key);
  if (typeof fallback === 'string') return interpolate(fallback, vars);
  if (vars?.defaultValue) return interpolate(vars.defaultValue, vars);
  return key;
}

export { en, ne };
