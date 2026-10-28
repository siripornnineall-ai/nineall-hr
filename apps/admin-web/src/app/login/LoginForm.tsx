"use client";

import { useActionState, useEffect, useState } from "react";
import { PasswordInput } from "@/components/PasswordInput";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  // "Remember": keeps the email / employee code (never the password) on this device.
  const [identifier, setIdentifier] = useState("");
  const [remember, setRemember] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nineall.rememberedId.admin");
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
      if (remember) window.localStorage.setItem("nineall.rememberedId.admin", identifier.trim());
      else window.localStorage.removeItem("nineall.rememberedId.admin");
    } catch {
      // ignore
    }
  }

  return (
    <form action={formAction} onSubmit={rememberOnSubmit} className="space-y-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="identifier">
          อีเมล หรือ รหัสพนักงาน
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
          className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 text-base outline-none focus:border-primary focus:ring-0"
          placeholder="เช่น admin@nineallgroup.co.th หรือ EMP-001"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="password">
          รหัสผ่าน
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 text-base outline-none focus:border-primary focus:ring-0"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-on-surface-variant">
          <input type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-outline-variant accent-primary" />
          จดจำอีเมล/รหัสพนักงานไว้ในเครื่องนี้
        </label>
        <a href="/forgot-password" className="font-semibold text-primary hover:underline">
          ลืมรหัสผ่าน?
        </a>
      </div>

      {state.error && (
        <div className="rounded-lg bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-primary font-bold text-on-primary shadow-md transition-transform active:scale-95 disabled:opacity-60"
      >
        {isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
