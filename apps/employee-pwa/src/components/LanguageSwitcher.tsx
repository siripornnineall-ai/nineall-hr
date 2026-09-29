"use client";

import clsx from "clsx";
import { LANGS, useT } from "@/lib/i18n";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <div className={clsx("inline-flex items-center gap-1 rounded-full border border-outline-variant bg-white p-1", className)} role="group" aria-label="ภาษา / Language">
      <span className="material-symbols-outlined pl-1.5 text-[18px] text-on-surface-variant">language</span>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          className={clsx(
            "rounded-full px-3 py-1 text-xs font-bold transition-colors",
            lang === l.code ? "bg-primary text-white" : "text-on-surface-variant hover:bg-surface-container"
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
