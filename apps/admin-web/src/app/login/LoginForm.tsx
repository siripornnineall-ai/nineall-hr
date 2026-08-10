"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-on-surface-variant" htmlFor="identifier">
          อีเมล หรือ รหัสพนักงาน
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
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
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 text-base outline-none focus:border-primary focus:ring-0"
          placeholder="••••••••"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-on-surface-variant">
          <input type="checkbox" name="remember" className="h-4 w-4 rounded border-outline-variant accent-primary" />
          จดจำการเข้าสู่ระบบ
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
