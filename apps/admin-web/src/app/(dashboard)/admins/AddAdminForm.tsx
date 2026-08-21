"use client";

import { useState, useTransition } from "react";
import { createAdminAccountAction } from "./actions";

const ROLE_OPTIONS: { value: "super_admin" | "hr" | "manager"; label: string }[] = [
  { value: "hr", label: "ฝ่ายบุคคล" },
  { value: "manager", label: "หัวหน้าทีม" },
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด" },
];

export function AddAdminForm({ employees }: { employees: { id: string; employee_code: string; first_name: string; last_name: string }[] }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"super_admin" | "hr" | "manager">("hr");
  const [employeeId, setEmployeeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createAdminAccountAction(fullName, email, password, role, employeeId || null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSuccess(true);
      setFullName("");
      setEmail("");
      setPassword("");
      setEmployeeId("");
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="font-bold">เพิ่มผู้ดูแลระบบ</h3>

      {success && (
        <div className="rounded-lg bg-status-success/10 p-3 text-sm text-status-success">
          สร้างบัญชีผู้ดูแลระบบสำเร็จ — แจ้งอีเมลและรหัสผ่านให้ผู้ใช้เอง ระบบจะบังคับให้เปลี่ยนรหัสผ่านตอนเข้าสู่ระบบครั้งแรก
        </div>
      )}
      {error && <div className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</div>}

      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">ชื่อ-นามสกุล</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">อีเมลสำหรับเข้าสู่ระบบ</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">รหัสผ่านเริ่มต้น</label>
        <input
          type="text"
          autoComplete="off"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="อย่างน้อย 8 ตัวอักษร"
          className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">บทบาท</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "super_admin" | "hr" | "manager")}
          className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-semibold text-on-surface-variant">ผูกกับพนักงาน (ไม่บังคับ)</label>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm">
          <option value="">-- ไม่ผูกกับพนักงาน --</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employee_code} — {e.first_name} {e.last_name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={submit}
        disabled={isPending || !fullName.trim() || !email.trim() || password.length < 8}
        className="h-11 w-full rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-60"
      >
        {isPending ? "กำลังสร้าง..." : "สร้างบัญชีผู้ดูแลระบบ"}
      </button>
    </div>
  );
}
