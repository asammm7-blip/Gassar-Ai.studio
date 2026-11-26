import React, { createContext, useContext, useEffect, useState } from 'react';
import { storage } from '../storage';

export type FontScale = 'small' | 'medium' | 'large';
export type FontFamily = 'system' | 'sans' | 'serif' | 'mono';
export type AppLanguage = 'ar' | 'en';

interface AppSettingsContextValue {
  fontScale: FontScale;
  fontScaleFactor: number;
  fontFamily: FontFamily;
  fontFamilyCss: string;
  language: AppLanguage;
  profileName: string;
  setFontScale: (scale: FontScale) => Promise<void>;
  setFontFamily: (family: FontFamily) => Promise<void>;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  setProfileName: (name: string) => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [fontScale, setFontScaleState] = useState<FontScale>('medium');
  const [fontFamily, setFontFamilyState] = useState<FontFamily>('system');
  const [language, setLanguageState] = useState<AppLanguage>('ar');
  const [profileName, setProfileNameState] = useState<string>('المستخدم');

  useEffect(() => {
    void storage
      .multiGet(['gassar_font_scale', 'gassar_font_family', 'gassar_language', 'gassar_profile_name'])
      .then((entries) => {
        const map = Object.fromEntries(entries);
        if (map.gassar_font_scale === 'small' || map.gassar_font_scale === 'medium' || map.gassar_font_scale === 'large') {
          setFontScaleState(map.gassar_font_scale);
        }
        if (
          map.gassar_font_family === 'system' ||
          map.gassar_font_family === 'sans' ||
          map.gassar_font_family === 'serif' ||
          map.gassar_font_family === 'mono'
        ) {
          setFontFamilyState(map.gassar_font_family);
        }
        if (map.gassar_language === 'ar' || map.gassar_language === 'en') {
          setLanguageState(map.gassar_language);
        }
        if (map.gassar_profile_name?.trim()) {
          setProfileNameState(map.gassar_profile_name.trim());
        }
      });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    }
  }, [language]);

  const fontScaleFactor = fontScale === 'small' ? 0.9 : fontScale === 'large' ? 1.15 : 1;
  const fontFamilyCss =
    fontFamily === 'sans'
      ? "'Inter', 'Cairo', sans-serif"
      : fontFamily === 'serif'
        ? 'Georgia, serif'
        : fontFamily === 'mono'
          ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
          : "'Cairo', 'Inter', system-ui, sans-serif";

  const setFontScale = async (scale: FontScale) => {
    setFontScaleState(scale);
    await storage.setItem('gassar_font_scale', scale);
  };

  const setFontFamily = async (family: FontFamily) => {
    setFontFamilyState(family);
    await storage.setItem('gassar_font_family', family);
  };

  const setLanguage = async (lang: AppLanguage) => {
    setLanguageState(lang);
    await storage.setItem('gassar_language', lang);
  };

  const setProfileName = async (name: string) => {
    const clean = name.trim() || 'المستخدم';
    setProfileNameState(clean);
    await storage.setItem('gassar_profile_name', clean);
  };

  return (
    <AppSettingsContext.Provider
      value={{
        fontScale,
        fontScaleFactor,
        fontFamily,
        fontFamilyCss,
        language,
        profileName,
        setFontScale,
        setFontFamily,
        setLanguage,
        setProfileName,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return ctx;
}
