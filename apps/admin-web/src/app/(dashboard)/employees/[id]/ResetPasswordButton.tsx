"use client";

import { useState, useTransition } from "react";
import { resetEmployeePasswordAction } from "../actions";

// HR sets a new temporary password for an employee who forgot theirs. Mirrors
// CreateLoginAccountButton: HR types the password, tells the employee in person, and the
// app forces a change at the next login.
export function ResetPasswordButton({ employeeId, loginEmail }: { employeeId: string; loginEmail: string | null }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await resetEmployeePasswordAction(employeeId, password);
      if (result?.error) setError(result.error);
      else {
        setDone(password);
        setOpen(false);
        setPassword("");
      }
    });
  }

  return (
    <div className="mt-3">
      {done && (
        <div className="mb-2 space-y-1 rounded-lg border border-status-success bg-status-success/10 p-3 text-sm text-status-success">
          <p>
            รีเซ็ตรหัสผ่านแล้ว รหัสผ่านชั่วคราว: <span className="font-mono font-bold">{done}</span>
          </p>
          <p>แจ้งพนักงานให้เข้าสู่ระบบด้วยรหัสนี้ ระบบจะบังคับให้ตั้งรหัสผ่านใหม่ทันที และอุปกรณ์ที่เคยเข้าสู่ระบบไว้จะถูกออกจากระบบทั้งหมด</p>
        </div>
      )}
      {!open ? (
        <button onClick={() => setOpen(true)} className="w-full rounded-lg border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface hover:bg-surface-variant/20">
          รีเซ็ตรหัสผ่านพนักงาน
        </button>
      ) : (
        <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container p-4 text-left">
          <p className="text-xs text-on-surface-variant">
            บัญชี: <span className="font-mono">{loginEmail ?? "-"}</span>
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">รหัสผ่านชั่วคราวใหม่</label>
            <input
              type="text"
              autoComplete="off"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="อย่างน้อย 8 ตัวอักษร"
              className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} disabled={isPending} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
              ยกเลิก
            </button>
            <button
              onClick={submit}
              disabled={isPending || password.length < 8}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isPending ? "กำลังรีเซ็ต..." : "ยืนยันรีเซ็ต"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
