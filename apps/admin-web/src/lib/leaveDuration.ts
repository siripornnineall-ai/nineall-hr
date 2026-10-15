// How long a leave request is, in words people understand (owner 2026-10-15): hourly leave is
// shown in hours/minutes with the times ("30 นาที (17:00-17:30)") instead of a fraction of a day
// like 0.44; half-day says morning/afternoon; whole days stay as a number of days.
function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

const hhmm = (time: string) => time.slice(0, 5);

export function formatLeaveDuration(unit: string | null | undefined, totalDays: number, startTime: string | null, endTime: string | null): string {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (unit === "hourly" && start != null && end != null && end > start) {
    // The 12:00-13:00 lunch break is not leave time.
    const lunchOverlap = Math.max(0, Math.min(end, 13 * 60) - Math.max(start, 12 * 60));
    const minutes = end - start - lunchOverlap;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const words = h > 0 && m > 0 ? `${h} ชม. ${m} นาที` : h > 0 ? `${h} ชม.` : `${m} นาที`;
    return `${words} (${hhmm(startTime!)}-${hhmm(endTime!)})`;
  }
  if (unit === "half_day") {
    const period = start != null && start >= 12 * 60 ? "บ่าย" : "เช้า";
    return `ครึ่งวัน (${period})`;
  }
  return `${totalDays} วัน`;
}

// Display-only: stored total_days is not changed by this helper.

const LEAVE_STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว" };

/**
 * Why a day that is not plain "on time" looks the way it does: the leave on file for that day,
 * or, for someone who left early, an explicit "ไม่มีใบลา" (owner 2026-10-15: the Attendance
 * page should say whether they took leave or really left early).
 */
export function explainDayLeave(
  leaves: { typeName: string | null; unit: string | null; totalDays: number; startTime: string | null; endTime: string | null; status: string }[],
  status: string
): string | null {
  if (leaves.length > 0) {
    return leaves
      .map((l) => `ลา: ${l.typeName ?? "-"} ${formatLeaveDuration(l.unit, l.totalDays, l.startTime, l.endTime)} (${LEAVE_STATUS_TH[l.status] ?? l.status})`)
      .join(" · ");
  }
  return status === "early_leave" ? "ไม่มีใบลา" : null;
}
