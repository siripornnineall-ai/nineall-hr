"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { updateAdminAccountAction } from "./actions";

const ROLE_LABEL_TH: Record<string, string> = {
  super_admin: "ผู้ดูแลระบบสูงสุด",
  hr: "ฝ่ายบุคคล",
  manager: "หัวหน้าทีม",
};

const ROLE_OPTIONS: { value: "super_admin" | "hr" | "manager"; label: string }[] = [
  { value: "hr", label: "ฝ่ายบุคคล" },
  { value: "manager", label: "หัวหน้าทีม" },
  { value: "super_admin", label: "ผู้ดูแลระบบสูงสุด" },
];

export interface AdminRowData {
  id: string;
  fullName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  employeeCode: string | null;
}

export function AdminRow({ admin }: { admin: AdminRowData }) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(admin.fullName);
  const [email, setEmail] = useState(admin.email ?? "");
  const [role, setRole] = useState<"super_admin" | "hr" | "manager">((admin.role as "super_admin" | "hr" | "manager") ?? "hr");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAdminAccountAction(admin.id, fullName, email, role, newPassword);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setNewPassword("");
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={5} className="px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อ-นามสกุล</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">อีเมลเข้าสู่ระบบ</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 rounded-lg border border-outline-variant px-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">บทบาท</label>
              <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ตั้งรหัสผ่านใหม่ (ไม่บังคับ)</label>
              <input
                type="text"
                autoComplete="off"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="เว้นว่างถ้าไม่เปลี่ยน"
                className="h-9 rounded-lg border border-outline-variant px-2 text-sm"
              />
            </div>
            <button onClick={save} disabled={isPending} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="h-9 rounded-lg px-3 text-xs font-semibold text-on-surface-variant"
            >
              ยกเลิก
            </button>
            {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        {admin.fullName}
        {admin.employeeCode && <div className="text-xs font-normal text-on-surface-variant">พนักงาน {admin.employeeCode}</div>}
      </td>
      <td className="px-4 py-3">{admin.email ?? "-"}</td>
      <td className="px-4 py-3">{ROLE_LABEL_TH[admin.role] ?? admin.role}</td>
      <td className="px-4 py-3">
        <Badge tone={admin.isActive ? "success" : "neutral"}>{admin.isActive ? "ใช้งานอยู่" : "ปิดใช้งาน"}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
          แก้ไข
        </button>
      </td>
    </tr>
  );
}
