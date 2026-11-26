import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '../storage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  themeSelection: ThemeMode;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  setThemeSelection: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeSelection, setThemeState] = useState<ThemeMode>('system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(resolveSystemTheme);

  useEffect(() => {
    void storage.getItem('gassar_theme').then((saved) => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    });
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => setSystemTheme(mq.matches ? 'dark' : 'light');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  const resolvedTheme: ResolvedTheme = themeSelection === 'system' ? systemTheme : themeSelection;
  const isDark = resolvedTheme === 'dark';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
  }, [isDark]);

  const setThemeSelection = async (mode: ThemeMode) => {
    setThemeState(mode);
    await storage.setItem('gassar_theme', mode);
  };

  return (
    <ThemeContext.Provider value={{ themeSelection, resolvedTheme, isDark, setThemeSelection }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
