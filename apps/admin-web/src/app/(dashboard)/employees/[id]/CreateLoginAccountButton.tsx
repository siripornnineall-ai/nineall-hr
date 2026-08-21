"use client";

import { useState, useTransition } from "react";
import { createEmployeeLoginAccountAction } from "../actions";

export function CreateLoginAccountButton({
  employeeId,
  fullName,
  defaultEmail,
}: {
  employeeId: string;
  fullName: string;
  defaultEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createEmployeeLoginAccountAction(employeeId, fullName, email);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="mt-2 rounded-lg border border-status-success bg-status-success/10 p-3 text-sm text-status-success">
        สร้างบัญชีให้ {email} แล้ว ระบบส่งอีเมลให้พนักงานตั้งรหัสผ่านของตัวเองแล้ว
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-primary px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5"
      >
        สร้างบัญชีเข้าสู่ระบบ (แอปพนักงาน)
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-outline-variant bg-surface-container p-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">อีเมลสำหรับเข้าสู่ระบบ</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-on-surface-variant">ระบบจะส่งอีเมลให้พนักงานตั้งรหัสผ่านของตัวเองในการเข้าสู่ระบบครั้งแรก</p>
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} disabled={isPending} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
        <button onClick={submit} disabled={isPending || !email} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังสร้าง..." : "สร้างบัญชี"}
        </button>
      </div>
    </div>
  );
}
