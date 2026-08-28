"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { updateAttendanceTimeAction } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "info" | "holiday" | "neutral"; label: string }> = {
  on_time: { tone: "success", label: "ตรงเวลา" },
  late: { tone: "warning", label: "มาสาย" },
  early_leave: { tone: "warning", label: "ออกก่อน" },
  absent: { tone: "danger", label: "ขาดงาน" },
  holiday: { tone: "holiday", label: "วันหยุด" },
  leave: { tone: "info", label: "ลา" },
  work_from_home: { tone: "info", label: "WFH" },
  off_site: { tone: "info", label: "นอกสถานที่" },
  pending_offline: { tone: "neutral", label: "รอซิงค์" },
  day_off: { tone: "neutral", label: "หยุดประจำ" },
};

// Empty string = "leave as-is / recompute from times" — the rest let HR correct a
// wrongly-derived status (e.g. "มาสาย" when the morning was actually approved leave)
// without touching the real clock-in/out times still shown alongside it.
const STATUS_EDIT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "-- ไม่เปลี่ยนสถานะ --" },
  { value: "on_time", label: "ตรงเวลา" },
  { value: "late", label: "มาสาย" },
  { value: "early_leave", label: "ออกก่อน" },
  { value: "leave", label: "ลา" },
  { value: "absent", label: "ขาดงาน" },
  { value: "holiday", label: "วันหยุด" },
  { value: "day_off", label: "หยุดประจำ" },
  { value: "work_from_home", label: "WFH" },
  { value: "off_site", label: "นอกสถานที่" },
];

// Shows seconds: clock-in and clock-out within the same minute (e.g. someone testing
// the flow by tapping both in quick succession) otherwise render as identical HH:MM
// even though the underlying timestamps genuinely differ — looked like a bug, wasn't one.
//
// Explicit timeZone: this is a client component, so without it these would read the
// viewer's own device/browser clock — right by coincidence for a Thailand-based admin,
// silently wrong for anyone whose device is set to a different timezone.
function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

interface AttendanceRowData {
  id: string;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  photoUrl: string | null;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  statusDetail: string | null;
  lateMinutes: number;
  otMinutes: number;
  withinGeofence: boolean | null;
  needsReview: boolean;
  shiftId: string | null;
  workLocationId: string | null;
}

export function AttendanceRow({
  row,
  zebra,
  shifts,
  workLocations,
}: {
  row: AttendanceRowData;
  zebra: boolean;
  shifts: { id: string; name: string }[];
  workLocations: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [clockIn, setClockIn] = useState(toTimeInputValue(row.clockIn));
  const [clockOut, setClockOut] = useState(toTimeInputValue(row.clockOut));
  const [shiftId, setShiftId] = useState(row.shiftId ?? "");
  const [workLocationId, setWorkLocationId] = useState(row.workLocationId ?? "");
  const [statusOverride, setStatusOverride] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAttendanceTimeAction(row.id, row.workDate, { clockIn, clockOut, shiftId, workLocationId, status: statusOverride || undefined });
      if (result?.error) setError(result.error);
      else {
        setStatusOverride("");
        setEditing(false);
      }
    });
  }

  if (editing) {
    return (
      <tr className={zebra ? "bg-row-zebra" : ""}>
        <td className="px-4 py-3" colSpan={9}>
          <div className="flex flex-wrap items-end gap-3">
            <p className="w-full text-xs font-bold text-on-surface-variant">
              {row.employeeName} ({row.employeeCode})
            </p>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เข้างาน</label>
              <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ออกงาน</label>
              <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">กะ</label>
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm">
                <option value="">-- เลือกกะ --</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">สถานะ</label>
              <select value={statusOverride} onChange={(e) => setStatusOverride(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm">
                {STATUS_EDIT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">พื้นที่</label>
              <select value={workLocationId} onChange={(e) => setWorkLocationId(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm">
                <option value="">-- ไม่ระบุ --</option>
                {workLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={save} disabled={isPending} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button onClick={() => setEditing(false)} disabled={isPending} className="h-9 rounded-lg px-3 text-xs font-semibold text-on-surface-variant">
              ยกเลิก
            </button>
            {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={zebra ? "bg-row-zebra hover:bg-row-hover" : "hover:bg-row-hover"}>
      <td className="px-4 py-3">{row.employeeCode}</td>
      <td className="px-4 py-3 font-semibold">
        <Link href={`/attendance/${row.employeeId}`} className="flex items-center gap-2 hover:text-primary hover:underline">
          <Avatar url={row.photoUrl} size={28} />
          <span>
            {row.employeeName}
            {row.needsReview && <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">ต้องตรวจสอบ</span>}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3">{formatTime(row.clockIn)}</td>
      <td className="px-4 py-3">{formatTime(row.clockOut)}</td>
      <td className="px-4 py-3">{row.lateMinutes || "-"}</td>
      <td className="px-4 py-3">{row.otMinutes || "-"}</td>
      <td className="px-4 py-3">
        {row.withinGeofence === null ? "-" : row.withinGeofence ? <span className="text-green-600">ในพื้นที่</span> : <span className="text-red-600">นอกพื้นที่</span>}
      </td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
        {row.statusDetail && <div className="mt-1 text-xs text-on-surface-variant">{row.statusDetail}</div>}
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
          แก้ไขเวลา
        </button>
      </td>
    </tr>
  );
}
