import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translate, type Locale, type TVars } from '../i18n';

const LOCALE_KEY = 'farm.locale';

export type TFunction = (key: string, vars?: TVars) => string;

type LocaleContextValue = {
  locale: Locale;
  t: TFunction;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(LOCALE_KEY).then((value) => {
      if (value === 'en' || value === 'ne') setLocaleState(value);
      setReady(true);
    });
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void SecureStore.setItemAsync(LOCALE_KEY, next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'ne' ? 'en' : 'ne');
  }, [locale, setLocale]);

  const t = useCallback<TFunction>((key, vars) => translate(locale, key, vars), [locale]);

  const value = useMemo(
    () => ({ locale, t, setLocale, toggleLocale }),
    [locale, t, setLocale, toggleLocale],
  );

  void ready;
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale requires LocaleProvider');
  return ctx;
}
