"use client";

import { useState, useTransition } from "react";
import { createTrainingRecordAction } from "./actions";
import { DateField } from "../employees/DateField";

interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

export function AddTrainingForm({ employees }: { employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [trainingDate, setTrainingDate] = useState("");
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmployeeId("");
    setTitle("");
    setProvider("");
    setTrainingDate("");
    setHours("");
    setNotes("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createTrainingRecordAction({ employeeId, title, provider, trainingDate, hours, notes });
      if (result?.error) setError(result.error);
      else {
        reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
        + บันทึกการอบรม
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">บันทึกการอบรม/สัมมนา</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">พนักงาน</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- เลือกพนักงาน --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code} — {e.first_name} {e.last_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">ชื่อหลักสูตร/การอบรม</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">ผู้จัดอบรม (ไม่บังคับ)</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <DateField label="วันที่อบรม" name="trainingDate" required value={trainingDate} onChange={setTrainingDate} />
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">จำนวนชั่วโมง (ไม่บังคับ)</label>
          <input type="number" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="block text-xs font-semibold text-on-surface-variant">หมายเหตุ (ไม่บังคับ)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
