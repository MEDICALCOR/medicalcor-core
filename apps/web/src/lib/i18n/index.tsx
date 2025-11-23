'use client';

import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { translations } from './translations';
import type { Language } from './translations';

type Translations = typeof translations.ro;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (namespace: keyof Translations, key: string) => string;
  availableLanguages: { code: Language; name: string }[];
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = 'medicalcor-language';

const availableLanguages: { code: Language; name: string }[] = [
  { code: 'ro', name: 'Română' },
  { code: 'en', name: 'English' },
];

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('ro');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Load saved language preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ro' || saved === 'en') {
      setLanguageState(saved);
    } else {
      // Detect browser language
      const browserLang = navigator.language.split('-')[0];
      if (browserLang === 'ro' || browserLang === 'en') {
        setLanguageState(browserLang);
      }
    }
    setIsInitialized(true);
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    // Update html lang attribute
    document.documentElement.lang = lang;
  }, []);

  const t = useCallback(
    (namespace: keyof Translations, key: string): string => {
      const namespaceObj = translations[language][namespace] as Record<string, string> | undefined;
      if (!namespaceObj) return key;
      return namespaceObj[key] ?? key;
    },
    [language]
  );

  // Prevent hydration mismatch by not rendering until initialized
  if (!isInitialized) {
    return null;
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, availableLanguages }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export { type Language } from './translations';
