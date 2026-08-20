"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(requestPasswordResetAction, initialState);

  if (state.success) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
        หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว กรุณาตรวจสอบกล่องจดหมาย
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input
        name="email"
        type="email"
        required
        placeholder="อีเมลที่ใช้เข้าสู่ระบบ"
        className="h-12 w-full rounded-lg border border-outline-variant px-4 text-sm outline-none focus:border-primary"
      />
      {state.error && <p className="text-sm text-error">{state.error}</p>}
      <button type="submit" disabled={isPending} className="h-12 w-full rounded-xl bg-primary font-bold text-white disabled:opacity-60">
        {isPending ? "กำลังส่ง..." : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
      </button>
    </form>
  );
}
