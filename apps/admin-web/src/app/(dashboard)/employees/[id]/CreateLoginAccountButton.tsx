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
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createEmployeeLoginAccountAction(employeeId, fullName, email, password);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (success) {
    return (
      <div className="mt-2 space-y-1 rounded-lg border border-status-success bg-status-success/10 p-3 text-sm text-status-success">
        <p>
          สร้างบัญชีให้ <span className="font-mono font-bold">{email}</span> แล้ว
        </p>
        <p>
          รหัสผ่านเริ่มต้น: <span className="font-mono font-bold">{password}</span>
        </p>
        <p>แจ้งพนักงานให้เข้าสู่ระบบด้วยข้อมูลนี้ — ระบบจะบังคับให้เปลี่ยนรหัสผ่านเองในการเข้าสู่ระบบครั้งแรก</p>
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
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">รหัสผ่านเริ่มต้น</label>
        <input
          type="text"
          autoComplete="off"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="อย่างน้อย 8 ตัวอักษร"
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-on-surface-variant">พี่เป็นคนตั้งรหัสผ่านเริ่มต้นให้เอง แล้วแจ้งพนักงานด้วยตัวเอง</p>
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} disabled={isPending} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
        <button
          onClick={submit}
          disabled={isPending || !email || password.length < 8}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {isPending ? "กำลังสร้าง..." : "สร้างบัญชี"}
        </button>
      </div>
    </div>
  );
}
