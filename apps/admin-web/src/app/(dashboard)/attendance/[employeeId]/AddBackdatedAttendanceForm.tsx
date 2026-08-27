"use client";

import { useState, useTransition } from "react";
import { createBackdatedAttendanceAction } from "../actions";

interface ShiftOption {
  id: string;
  name: string;
}

interface WorkLocationOption {
  id: string;
  name: string;
}

// Empty string = "compute automatically from the times entered" (on_time/late/early_leave).
// The rest are day types where there's nothing to compute from a clock-in/out time.
const SPECIAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ปกติ (คำนวณสถานะจากเวลาที่กรอกให้อัตโนมัติ)" },
  { value: "leave", label: "ลา" },
  { value: "absent", label: "ขาดงาน" },
  { value: "holiday", label: "วันหยุด" },
  { value: "day_off", label: "หยุดประจำ" },
  { value: "work_from_home", label: "WFH" },
  { value: "off_site", label: "นอกสถานที่" },
];

export function AddBackdatedAttendanceForm({
  employeeId,
  shifts,
  workLocations,
  defaultShiftId,
  defaultWorkLocationId,
}: {
  employeeId: string;
  shifts: ShiftOption[];
  workLocations: WorkLocationOption[];
  defaultShiftId: string;
  defaultWorkLocationId: string;
}) {
  const [open, setOpen] = useState(false);
  const [workDate, setWorkDate] = useState("");
  const [status, setStatus] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [shiftId, setShiftId] = useState(defaultShiftId);
  const [workLocationId, setWorkLocationId] = useState(defaultWorkLocationId);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setWorkDate("");
    setStatus("");
    setClockIn("");
    setClockOut("");
    setShiftId(defaultShiftId);
    setWorkLocationId(defaultWorkLocationId);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createBackdatedAttendanceAction(employeeId, {
        workDate,
        status,
        clockIn: clockIn || undefined,
        clockOut: clockOut || undefined,
        shiftId: shiftId || undefined,
        workLocationId: workLocationId || undefined,
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
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
        + กรอกเวลาย้อนหลัง
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">กรอกข้อมูลการลงเวลาย้อนหลัง (สำหรับวันที่ไม่มีบันทึก)</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant" htmlFor="backdatedWorkDate">
            วันที่ <span className="text-primary">*</span>
          </label>
          <input
            id="backdatedWorkDate"
            type="date"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">สถานะ</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            {SPECIAL_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">เวลาเข้างาน (ไม่บังคับ)</label>
          <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">เวลาออกงาน (ไม่บังคับ)</label>
          <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">กะการทำงาน (ไม่บังคับ)</label>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- ไม่ระบุ --</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">สถานที่ทำงาน (ไม่บังคับ)</label>
          <select
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          >
            <option value="">-- ไม่ระบุ --</option>
            {workLocations.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
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
