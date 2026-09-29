"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { MESSAGES, type Lang } from "@/lib/i18nMessages";

// Employee-app languages (2026-09-28): Thai is the source language of every string in the
// code; Lao and Burmese come from the MESSAGES dictionary keyed by the Thai text. Anything
// without a translation simply stays Thai, so partially translated screens never break.
//
// `t()` is a plain module-level function so it can be used anywhere (including inside
// module-level helpers); components must also call useT() so they re-render when the
// language changes.
export const LANGS: { code: Lang; label: string }[] = [
  { code: "th", label: "ไทย" },
  { code: "lo", label: "ລາວ" },
  { code: "my", label: "မြန်မာ" },
];

const STORAGE_KEY = "nineall.lang";
let activeLang: Lang = "th";

export function t(text: string): string {
  if (activeLang === "th") return text;
  const table = MESSAGES[activeLang];
  if (!table) return text;
  return table[text] ?? table[text.replace(/\s+/g, " ").trim()] ?? text;
}

function isLang(v: unknown): v is Lang {
  return v === "th" || v === "lo" || v === "my";
}

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LangContext = createContext<LangContextValue>({ lang: "th", setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [lang, setLangState] = useState<Lang>("th");

  const apply = useCallback((next: Lang) => {
    activeLang = next;
    setLangState(next);
    if (typeof document !== "undefined") document.documentElement.lang = next;
  }, []);

  // First paint is always Thai (matches the server), then switch to the saved choice: the
  // device's own setting first, else the language stored on the profile.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    if (isLang(saved)) {
      apply(saved);
      return;
    }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("preferred_language").eq("id", data.user.id).maybeSingle();
      if (isLang(profile?.preferred_language) && profile.preferred_language !== "th") apply(profile.preferred_language);
    });
  }, [apply, supabase]);

  const setLang = useCallback(
    (next: Lang) => {
      apply(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) supabase.from("profiles").update({ preferred_language: next }).eq("id", data.user.id).then(() => {});
      });
    },
    [apply, supabase]
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Subscribe a component to language changes and get the translator. */
export function useT() {
  const { lang, setLang } = useContext(LangContext);
  return { t, lang, setLang };
}
