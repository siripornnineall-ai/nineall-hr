import type { AttendanceInput, AttendanceResult, ShiftConfig } from "./types";

const MINUTE_MS = 60_000;

function parseTimeOnDate(workDate: string, hhmm: string, addDays = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${workDate}T00:00:00`);
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d;
}

function diffMinutes(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MINUTE_MS);
}

function floorToStep(minutes: number, step: number): number {
  if (step <= 1) return Math.max(0, Math.round(minutes));
  return Math.max(0, Math.floor(minutes / step) * step);
}

function shiftWindow(workDate: string, shift: ShiftConfig): { start: Date; end: Date } {
  const start = parseTimeOnDate(workDate, shift.startTime);
  const end = parseTimeOnDate(workDate, shift.endTime, shift.isOvernight ? 1 : 0);
  return { start, end };
}

function sumBreakMinutes(breaks: AttendanceInput["breaks"]): number {
  if (!breaks || breaks.length === 0) return 0;
  return breaks.reduce((total, b) => {
    if (!b.end) return total;
    return total + Math.max(0, diffMinutes(b.end, b.start));
  }, 0);
}

/**
 * Compute a single day's attendance outcome from raw clock events + shift config.
 * Pure function — no I/O, no timezone lookups beyond the caller-supplied local
 * "YYYY-MM-DD" workDate, so it is fully unit-testable and safe to run server-side
 * (Edge Function) as the single source of truth for attendance status.
 */
export function computeAttendance(input: AttendanceInput): AttendanceResult {
  const { workDate, shift, clockIn, clockOut, breaks } = input;

  if (input.isOnApprovedLeave && input.leaveIsFullDay !== false) {
    return { status: "leave", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0, needsReview: false };
  }

  if (input.isHoliday && !clockIn && !clockOut) {
    return { status: "holiday", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0, needsReview: false };
  }

  if (!shift) {
    if (!clockIn && !clockOut) {
      return { status: "holiday", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, otMinutes: 0, needsReview: false };
    }
    // Worked on an unscheduled day (e.g. holiday OT) — no shift to compare against.
    const worked = clockIn && clockOut ? Math.max(0, diffMinutes(clockOut, clockIn) - sumBreakMinutes(breaks)) : 0;
    return {
      status: input.isHoliday ? "holiday" : "off_site",
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: worked,
      otMinutes: worked,
      needsReview: true,
      reviewNote: "worked_without_scheduled_shift",
    };
  }

  if (!clockIn) {
    return {
      status: "absent",
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
      otMinutes: 0,
      needsReview: true,
      reviewNote: "no_clock_in",
    };
  }

  const { start, end } = shiftWindow(workDate, shift);

  if (!clockOut) {
    const lateMinutes = Math.max(0, diffMinutes(clockIn, start) - shift.graceMinutesLate);
    return {
      status: lateMinutes > 0 ? "late" : "on_time",
      lateMinutes,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
      otMinutes: 0,
      needsReview: true,
      reviewNote: "missing_clock_out",
    };
  }

  // A half-day (or hourly) approved leave already accounts for the absent portion of
  // the shift, so it must not also be penalized as "late" / "early leave".
  const onPartialDayLeave = Boolean(input.isOnApprovedLeave && input.leaveIsFullDay === false);
  const lateMinutes = onPartialDayLeave ? 0 : Math.max(0, diffMinutes(clockIn, start) - shift.graceMinutesLate);
  const earlyLeaveMinutes = onPartialDayLeave ? 0 : Math.max(0, diffMinutes(end, clockOut) - shift.graceMinutesEarlyLeave);

  const breakMinutes = breaks && breaks.length > 0 ? sumBreakMinutes(breaks) : shift.unpaidBreakMinutes;
  const rawWorkedMinutes = Math.max(0, diffMinutes(clockOut, clockIn) - breakMinutes);
  const workedMinutes = floorToStep(rawWorkedMinutes, shift.roundToMinutes);

  const scheduledMinutes = Math.max(0, diffMinutes(end, start) - shift.unpaidBreakMinutes);
  let otMinutes = 0;
  if (shift.otAfterShiftAllowed && diffMinutes(clockOut, end) > 0) {
    otMinutes += floorToStep(diffMinutes(clockOut, end), shift.roundToMinutes);
  }
  if (shift.otBeforeShiftAllowed && diffMinutes(start, clockIn) > 0) {
    otMinutes += floorToStep(diffMinutes(start, clockIn), shift.roundToMinutes);
  }
  void scheduledMinutes;

  let status: AttendanceResult["status"] = "on_time";
  if (input.isWorkFromHome) status = "work_from_home";
  else if (input.isOffSite) status = "off_site";
  else if (input.isHoliday) status = "holiday";
  else if (lateMinutes > 0) status = "late";
  else if (earlyLeaveMinutes > 0) status = "early_leave";

  const needsReview = Boolean(input.isOfflineSubmission);

  return {
    status,
    lateMinutes,
    earlyLeaveMinutes,
    workedMinutes,
    otMinutes,
    needsReview,
    reviewNote: needsReview ? "offline_submission_pending_verification" : undefined,
  };
}
