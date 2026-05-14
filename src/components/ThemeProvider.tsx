'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeChoice;
  resolved: 'light' | 'dark';
  setTheme: (t: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'joc-theme';

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyDocumentTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

/**
 * ThemeProvider keeps three-state preference (system/light/dark) in localStorage
 * and applies the resolved theme as a `.dark` class on <html>. The matching
 * inline script in layout.tsx runs first to avoid a flash of wrong theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Initial read from localStorage + system preference.
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) as
      | ThemeChoice
      | null;
    const initial: ThemeChoice =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    const initialResolved = initial === 'system' ? getSystemTheme() : initial;
    setThemeState(initial);
    setResolved(initialResolved);
    applyDocumentTheme(initialResolved);
  }, []);

  // React to OS preference changes when theme === 'system'.
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyDocumentTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next);
    const r = next === 'system' ? getSystemTheme() : next;
    setResolved(r);
    applyDocumentTheme(r);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback for SSR / outside provider: no-op setter.
    return { theme: 'system', resolved: 'light', setTheme: () => undefined };
  }
  return ctx;
}
