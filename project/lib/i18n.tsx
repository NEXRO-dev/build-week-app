"use client";

import { createContext, type ReactNode, useContext, useEffect } from "react";

import type { AppLocale } from "@/lib/i18n-config";

type I18nValue = {
  locale: AppLocale;
  isEnglish: boolean;
  t: (japanese: string, english: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const isEnglish = locale === "us-en";

  useEffect(() => {
    document.documentElement.lang = isEnglish ? "en-US" : "ja-JP";
  }, [isEnglish]);

  return (
    <I18nContext.Provider value={{ locale, isEnglish, t: (japanese, english) => isEnglish ? english : japanese }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
