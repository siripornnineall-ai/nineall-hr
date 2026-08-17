"use client";

import { useState, useTransition } from "react";
import { assignShiftAction } from "../actions";

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}
interface WorkLocation {
  id: string;
  name: string;
}
interface CurrentAssignment {
  work_date: string;
  shift_name: string | null;
}

export function ShiftAssignment({
  employeeId,
  shifts,
  workLocations,
  currentAssignment,
}: {
  employeeId: string;
  shifts: Shift[];
  workLocations: WorkLocation[];
  currentAssignment: CurrentAssignment | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [shiftId, setShiftId] = useState("");
  const [workLocationId, setWorkLocationId] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await assignShiftAction(employeeId, { shiftId, workLocationId, startDate, endDate });
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-bold">กะการทำงาน</h3>
      {currentAssignment && (
        <p className="mb-4 text-sm text-on-surface-variant">
          วันนี้: <span className="font-semibold text-on-surface">{currentAssignment.shift_name ?? "-"}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">กะ</label>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- เลือกกะ --</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.start_time}-{s.end_time})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">สถานที่ทำงาน (ไม่บังคับ)</label>
          <select
            value={workLocationId}
            onChange={(e) => setWorkLocationId(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          >
            <option value="">-- ไม่ระบุ --</option>
            {workLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ตั้งแต่วันที่</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ถึงวันที่</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-status-danger">{error}</p>}
      {success && <p className="mt-2 text-sm font-semibold text-status-success">กำหนดกะเรียบร้อยแล้ว</p>}
      <button
        onClick={submit}
        disabled={isPending}
        className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {isPending ? "กำลังบันทึก..." : "กำหนดกะ"}
      </button>
    </section>
  );
}
