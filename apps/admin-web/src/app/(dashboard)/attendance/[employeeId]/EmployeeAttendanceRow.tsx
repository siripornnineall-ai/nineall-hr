"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { updateAttendanceTimeAction } from "../actions";

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
};

// Server-rendered (not "use client"), so must convert explicitly — toLocaleTimeString with
// no timeZone would otherwise use the server's own clock (UTC on Vercel), not Bangkok time.
function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

function toTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

interface RowData {
  id: string;
  workDate: string;
  workDateLabel: string;
  clockIn: string | null;
  clockOut: string | null;
  lateMinutes: number;
  otMinutes: number;
  status: string;
  shiftId: string | null;
  workLocationId: string | null;
}

export function EmployeeAttendanceRow({
  row,
  shifts,
  workLocations,
}: {
  row: RowData;
  shifts: { id: string; name: string }[];
  workLocations: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [clockIn, setClockIn] = useState(toTimeInputValue(row.clockIn));
  const [clockOut, setClockOut] = useState(toTimeInputValue(row.clockOut));
  const [shiftId, setShiftId] = useState(row.shiftId ?? "");
  const [workLocationId, setWorkLocationId] = useState(row.workLocationId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateAttendanceTimeAction(row.id, row.workDate, { clockIn, clockOut, shiftId, workLocationId });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  if (editing) {
    return (
      <tr>
        <td className="px-4 py-3" colSpan={7}>
          <div className="flex flex-wrap items-end gap-3">
            <p className="w-full text-xs font-bold text-on-surface-variant">{row.workDateLabel}</p>
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
    <tr>
      <td className="px-4 py-3">{row.workDateLabel}</td>
      <td className="px-4 py-3">{formatTime(row.clockIn)}</td>
      <td className="px-4 py-3">{formatTime(row.clockOut)}</td>
      <td className="px-4 py-3">{row.lateMinutes || "-"}</td>
      <td className="px-4 py-3">{row.otMinutes || "-"}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
          แก้ไข
        </button>
      </td>
    </tr>
  );
}
