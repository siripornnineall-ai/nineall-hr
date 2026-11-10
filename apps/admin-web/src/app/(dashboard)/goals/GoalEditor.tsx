"use client";

import { useState, useTransition } from "react";
import type { GoalInput } from "./actions";

export interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
}

interface Props {
  employees?: EmployeeOption[]; // only when adding (pick who it is for)
  fixedEmployeeId?: string;
  initial?: Partial<GoalInput>;
  submitLabel: string;
  onSubmit: (values: GoalInput) => Promise<{ error?: string } | void>;
  onDone: () => void;
}

const input = "h-10 w-full rounded-lg border border-outline-variant px-3 text-sm";
const label = "mb-1 block text-xs font-semibold text-on-surface-variant";

// Add / edit form for a goal or KPI (admin / HR).
export function GoalEditor({ employees, fixedEmployeeId, initial, submitLabel, onSubmit, onDone }: Props) {
  const [v, setV] = useState<GoalInput>({
    employeeId: fixedEmployeeId ?? initial?.employeeId ?? "",
    kind: initial?.kind ?? "kpi",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    targetValue: initial?.targetValue ?? "",
    currentValue: initial?.currentValue ?? "",
    period: initial?.period ?? "",
    dueDate: initial?.dueDate ?? "",
    status: initial?.status ?? "active",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(v);
      if (result?.error) setError(result.error);
      else onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary bg-primary/5 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {employees && (
          <div className="md:col-span-2">
            <label className={label}>พนักงาน</label>
            <select value={v.employeeId} onChange={(e) => setV({ ...v, employeeId: e.target.value })} className={input}>
              <option value="">— เลือกพนักงาน —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee_code} · {e.nickname ? `${e.nickname} · ` : ""}
                  {e.first_name} {e.last_name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={label}>ประเภท</label>
          <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as "goal" | "kpi" })} className={input}>
            <option value="kpi">KPI (ตัวชี้วัดที่วัดผลได้)</option>
            <option value="goal">เป้าหมาย</option>
          </select>
        </div>
        <div>
          <label className={label}>สถานะ</label>
          <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as GoalInput["status"] })} className={input}>
            <option value="active">กำลังดำเนินการ</option>
            <option value="done">สำเร็จแล้ว</option>
            <option value="cancelled">ยกเลิก</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className={label}>หัวข้อ</label>
          <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="เช่น ยอดขายต่อเดือน" className={input} />
        </div>
        <div>
          <label className={label}>ค่าเป้าหมาย</label>
          <input value={v.targetValue} onChange={(e) => setV({ ...v, targetValue: e.target.value })} placeholder="เช่น 100 ออเดอร์/วัน" className={input} />
        </div>
        <div>
          <label className={label}>ความคืบหน้าปัจจุบัน</label>
          <input value={v.currentValue} onChange={(e) => setV({ ...v, currentValue: e.target.value })} placeholder="เช่น 40 ออเดอร์/วัน" className={input} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>รอบเวลา</label>
            <input value={v.period} onChange={(e) => setV({ ...v, period: e.target.value })} placeholder="เช่น ไตรมาส 4/2569" className={input} />
          </div>
          <div>
            <label className={label}>กำหนดเสร็จ</label>
            <input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} className={input} />
          </div>
        </div>
      </div>
      <div>
        <label className={label}>รายละเอียด (ไม่บังคับ)</label>
        <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} className="w-full rounded-lg border border-outline-variant p-3 text-sm" />
      </div>
      {error && <p className="text-xs font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : submitLabel}
        </button>
        <button onClick={onDone} disabled={isPending} className="rounded-lg px-3 py-2 text-sm font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
