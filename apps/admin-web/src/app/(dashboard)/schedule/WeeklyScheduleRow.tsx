"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { assignWeeklyScheduleAction } from "./actions";

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

// Column order is Mon-first for display, but JS day-of-week (used everywhere else in
// this codebase, e.g. Date#getDay/getUTCDay) is Sun-first (0-6) — this maps one to the
// other without needing a second numbering scheme.
const COLUMNS: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "จ." },
  { dayOfWeek: 2, label: "อ." },
  { dayOfWeek: 3, label: "พ." },
  { dayOfWeek: 4, label: "พฤ." },
  { dayOfWeek: 5, label: "ศ." },
  { dayOfWeek: 6, label: "ส." },
  { dayOfWeek: 0, label: "อา." },
];

export function WeeklyScheduleRow({
  employeeId,
  employeeCode,
  employeeName,
  photoUrl,
  shifts,
  initialPattern,
}: {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  photoUrl: string | null;
  shifts: Shift[];
  initialPattern: Record<number, string>;
}) {
  const [pattern, setPattern] = useState<Record<number, string>>(() => {
    const filled: Record<number, string> = {};
    for (const { dayOfWeek } of COLUMNS) filled[dayOfWeek] = initialPattern[dayOfWeek] ?? "";
    return filled;
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await assignWeeklyScheduleAction(employeeId, pattern);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <tr>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <Avatar url={photoUrl} size={28} />
          <div>
            <p className="font-semibold">{employeeName}</p>
            <p className="text-xs text-on-surface-variant">{employeeCode}</p>
          </div>
        </div>
      </td>
      {COLUMNS.map(({ dayOfWeek }) => (
        <td key={dayOfWeek} className="px-2 py-2">
          <select
            value={pattern[dayOfWeek]}
            onChange={(e) => {
              setSuccess(false);
              setPattern({ ...pattern, [dayOfWeek]: e.target.value });
            }}
            className="h-9 w-24 rounded-lg border border-outline-variant px-1 text-xs"
          >
            <option value="">หยุด</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </td>
      ))}
      <td className="px-4 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={submit}
            disabled={isPending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          {success && <span className="text-[11px] font-semibold text-status-success">บันทึกแล้ว</span>}
          {error && <span className="text-[11px] font-semibold text-status-danger">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
