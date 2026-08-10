"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";

const initialState: LoginActionState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-on-surface" htmlFor="identifier">
          อีเมล หรือ รหัสพนักงาน
        </label>
        <input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          required
          className="h-12 w-full rounded-xl border-[1.5px] border-outline-variant bg-surface-container-low px-4 text-base outline-none focus:border-secondary"
          placeholder="เช่น EMP-004"
        />
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-on-surface" htmlFor="password">
          รหัสผ่าน
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 w-full rounded-xl border-[1.5px] border-outline-variant bg-surface-container-low px-4 text-base outline-none focus:border-secondary"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <div className="rounded-xl bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{state.error}</div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-on-primary shadow-md transition-all active:scale-95 disabled:opacity-60"
      >
        {isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
