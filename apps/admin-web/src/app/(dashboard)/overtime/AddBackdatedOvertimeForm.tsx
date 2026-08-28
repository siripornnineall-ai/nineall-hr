"use client";

import { useState, useTransition } from "react";
import { createBackdatedOvertimeAction } from "./actions";

interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

export function AddBackdatedOvertimeForm({ employees }: { employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [rateMultiplier, setRateMultiplier] = useState("1");
  const [taskDescription, setTaskDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmployeeId("");
    setWorkDate("");
    setStartTime("18:00");
    setEndTime("19:00");
    setRateMultiplier("1");
    setTaskDescription("");
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBackdatedOvertimeAction({ employeeId, workDate, startTime, endTime, rateMultiplier, taskDescription, reason });
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
        + บันทึก OT ย้อนหลัง
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">บันทึก OT ย้อนหลังให้พนักงาน (อนุมัติทันที) — ใช้เมื่อพนักงานลืมกรอกขอเอง</p>
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
          <label className="block text-xs font-semibold text-on-surface-variant">วันที่</label>
          <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">เวลาเริ่ม</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">เวลาสิ้นสุด</label>
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">อัตรา OT</label>
          <input
            type="number"
            step="0.1"
            value={rateMultiplier}
            onChange={(e) => setRateMultiplier(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">งานที่ทำ (ไม่บังคับ)</label>
          <input value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">เหตุผล (ไม่บังคับ)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="บันทึกย้อนหลังโดยแอดมิน"
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "บันทึกและอนุมัติ"}
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
