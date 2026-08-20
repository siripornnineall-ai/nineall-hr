"use client";

import { useState, useTransition } from "react";
import { createBackdatedLeaveAction } from "./actions";
import { DateField } from "../employees/DateField";

interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

interface LeaveTypeOption {
  id: string;
  name_th: string;
}

export function AddBackdatedLeaveForm({ employees, leaveTypes }: { employees: EmployeeOption[]; leaveTypes: LeaveTypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalDays, setTotalDays] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmployeeId("");
    setLeaveTypeId("");
    setStartDate("");
    setEndDate("");
    setTotalDays("1");
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBackdatedLeaveAction({ employeeId, leaveTypeId, startDate, endDate, totalDays, reason });
      if (result?.error) setError(result.error);
      else {
        reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm"
      >
        + บันทึกการลาย้อนหลัง
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">บันทึกการลาย้อนหลังให้พนักงาน (อนุมัติทันที)</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">พนักงาน</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          >
            <option value="">-- เลือกพนักงาน --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code} — {e.first_name} {e.last_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">ประเภทลา</label>
          <select
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          >
            <option value="">-- เลือกประเภทลา --</option>
            {leaveTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name_th}
              </option>
            ))}
          </select>
        </div>
        <DateField label="วันที่เริ่มลา" name="backdatedStartDate" required value={startDate} onChange={setStartDate} />
        <DateField label="วันที่สิ้นสุด" name="backdatedEndDate" required value={endDate} onChange={setEndDate} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">จำนวนวัน</label>
          <input
            type="number"
            step="0.5"
            min="0.5"
            value={totalDays}
            onChange={(e) => setTotalDays(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
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
