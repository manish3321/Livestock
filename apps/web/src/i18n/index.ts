import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { ne } from './ne';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('locale') : null;

void i18n.use(initReactI18next).init({
  resources: { en, ne },
  lng: stored === 'ne' ? 'ne' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLocale(locale: 'en' | 'ne'): void {
  localStorage.setItem('locale', locale);
  void i18n.changeLanguage(locale);
}

export default i18n;
