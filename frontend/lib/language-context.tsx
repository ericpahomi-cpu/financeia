'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Lang, Translations, getT } from './translations';

const LS_KEY = 'financeai_lang';

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'fr',
  setLang: () => {},
  t: getT('fr'),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Read from localStorage immediately so the UI renders in the right language
  const initLang = (): Lang => {
    if (typeof window === 'undefined') return 'fr';
    return (localStorage.getItem(LS_KEY) as Lang) ?? 'fr';
  };

  const [lang, setLangState] = useState<Lang>(initLang);

  // Sync from Supabase on mount
  useEffect(() => {
    fetch('/api/user-settings')
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (d?.language && d.language !== lang) {
          const serverLang = d.language as Lang;
          setLangState(serverLang);
          localStorage.setItem(LS_KEY, serverLang);
        }
      })
      .catch(() => {});
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
    // Persist to Supabase (best-effort, no await needed here)
    fetch('/api/user-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: l }),
    }).catch(() => {});
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: getT(lang) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
