"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
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

type Unit = "full_day" | "half_day" | "hourly";

function UnitChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary text-white font-bold" : "border-outline-variant text-on-surface-variant"
      )}
    >
      {label}
    </button>
  );
}

export function AddBackdatedLeaveForm({ employees, leaveTypes }: { employees: EmployeeOption[]; leaveTypes: LeaveTypeOption[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [unit, setUnit] = useState<Unit>("full_day");
  const [halfDayPeriod, setHalfDayPeriod] = useState<"morning" | "afternoon">("morning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hourlyStart, setHourlyStart] = useState("09:00");
  const [hourlyEnd, setHourlyEnd] = useState("12:00");
  const [totalDays, setTotalDays] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function computeHourlyHours(): number {
    const [sh, sm] = hourlyStart.split(":").map(Number);
    const [eh, em] = hourlyEnd.split(":").map(Number);
    const hours = eh + em / 60 - (sh + sm / 60);
    return hours > 0 ? hours : 0;
  }

  function changeUnit(next: Unit) {
    setUnit(next);
    if (next === "half_day") setTotalDays("0.5");
    else if (next === "hourly") setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
    else setTotalDays("1");
  }

  function reset() {
    setEmployeeId("");
    setLeaveTypeId("");
    setUnit("full_day");
    setStartDate("");
    setEndDate("");
    setHourlyStart("09:00");
    setHourlyEnd("12:00");
    setTotalDays("1");
    setReason("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBackdatedLeaveAction({
        employeeId,
        leaveTypeId,
        unit,
        startDate,
        endDate,
        startTime: unit === "half_day" ? (halfDayPeriod === "morning" ? "08:00" : "13:00") : unit === "hourly" ? hourlyStart : undefined,
        endTime: unit === "half_day" ? (halfDayPeriod === "morning" ? "12:00" : "17:00") : unit === "hourly" ? hourlyEnd : undefined,
        totalDays,
        reason,
      });
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
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-semibold text-on-surface-variant">หน่วย</label>
        <div className="flex flex-wrap gap-2">
          <UnitChip label="เต็มวัน" active={unit === "full_day"} onClick={() => changeUnit("full_day")} />
          <UnitChip label="ครึ่งวัน" active={unit === "half_day"} onClick={() => changeUnit("half_day")} />
          <UnitChip label="รายชั่วโมง" active={unit === "hourly"} onClick={() => changeUnit("hourly")} />
        </div>
      </div>

      {unit === "full_day" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DateField label="วันที่เริ่มลา" name="backdatedStartDate" required value={startDate} onChange={setStartDate} />
          <DateField label="วันที่สิ้นสุด" name="backdatedEndDate" required value={endDate} onChange={setEndDate} />
        </div>
      )}

      {unit === "half_day" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DateField label="วันที่ลา" name="backdatedStartDate" required value={startDate} onChange={setStartDate} />
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-on-surface-variant">ช่วง</label>
            <div className="flex gap-2">
              <UnitChip label="เช้า" active={halfDayPeriod === "morning"} onClick={() => setHalfDayPeriod("morning")} />
              <UnitChip label="บ่าย" active={halfDayPeriod === "afternoon"} onClick={() => setHalfDayPeriod("afternoon")} />
            </div>
          </div>
        </div>
      )}

      {unit === "hourly" && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DateField label="วันที่ลา" name="backdatedStartDate" required value={startDate} onChange={setStartDate} />
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-on-surface-variant">เวลาเริ่ม</label>
            <input
              type="time"
              value={hourlyStart}
              onChange={(e) => {
                setHourlyStart(e.target.value);
                setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
              }}
              className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-on-surface-variant">เวลาสิ้นสุด</label>
            <input
              type="time"
              value={hourlyEnd}
              onChange={(e) => {
                setHourlyEnd(e.target.value);
                setTotalDays(String(Math.round((computeHourlyHours() / 8) * 100) / 100));
              }}
              className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">จำนวนวัน{unit === "hourly" && ` (${computeHourlyHours()} ชม.)`}</label>
          <input
            type="number"
            step="0.5"
            min="0.01"
            value={totalDays}
            onChange={(e) => setTotalDays(e.target.value)}
            disabled={unit !== "full_day"}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm disabled:bg-surface-container-low disabled:text-on-surface-variant"
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
