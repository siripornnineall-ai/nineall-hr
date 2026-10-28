"use client";

import { useActionState, useEffect, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { loginAction, type LoginActionState } from "./actions";
import { useT } from "@/lib/i18n";

const initialState: LoginActionState = {};

export function LoginForm() {
  const { t } = useT();
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  // "Remember": keeps the email / employee code (never the password) on this device.
  const [identifier, setIdentifier] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nineall.rememberedId.employee");
      if (saved) {
        setIdentifier(saved);
        setRemember(true);
      }
    } catch {
      // storage blocked — nothing to restore
    }
  }, []);
  function rememberOnSubmit() {
    try {
      if (remember) window.localStorage.setItem("nineall.rememberedId.employee", identifier.trim());
      else window.localStorage.removeItem("nineall.rememberedId.employee");
    } catch {
      // ignore
    }
  }

  return (
    <form action={formAction} onSubmit={rememberOnSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-on-surface" htmlFor="identifier">
          {t("อีเมล หรือ รหัสพนักงาน")}
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
          className="h-12 w-full rounded-xl border-[1.5px] border-outline-variant bg-surface-container-low px-4 text-base outline-none focus:border-secondary"
          placeholder={t("เช่น EMP-004")}
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-on-surface" htmlFor="password">
          {t("รหัสผ่าน")}
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-xl border-[1.5px] border-outline-variant bg-surface-container-low px-4 text-base outline-none focus:border-secondary"
          placeholder="••••••••"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-outline-variant accent-primary" />
        {t("จดจำอีเมล/รหัสพนักงานไว้ในเครื่องนี้")}
      </label>

      {state.error && (
        <div className="rounded-xl bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{state.error}</div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-on-primary shadow-md transition-all active:scale-95 disabled:opacity-60"
      >
        {isPending ? t("กำลังเข้าสู่ระบบ...") : t("เข้าสู่ระบบ")}
      </button>
    </form>
  );
}
