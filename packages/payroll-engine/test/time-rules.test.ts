import { describe, expect, it } from "vitest";
import { computeAttendance } from "../src/time-rules";
import type { ShiftConfig } from "../src/types";

const normalShift: ShiftConfig = {
  startTime: "08:30",
  endTime: "17:30",
  isOvernight: false,
  paidBreakMinutes: 0,
  unpaidBreakMinutes: 60,
  graceMinutesLate: 5,
  graceMinutesEarlyLeave: 0,
  minWorkMinutes: 0,
  otBeforeShiftAllowed: false,
  otAfterShiftAllowed: true,
  roundToMinutes: 1,
};

const nightShift: ShiftConfig = {
  ...normalShift,
  startTime: "22:00",
  endTime: "06:00",
  isOvernight: true,
};

const WORK_DATE = "2026-08-03";

function at(hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${WORK_DATE}T00:00:00`);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

describe("computeAttendance", () => {
  it("marks on-time when clocking in within grace period", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:33"),
      clockOut: at("17:30"),
    });
    expect(result.status).toBe("on_time");
    expect(result.lateMinutes).toBe(0);
    // 08:33 - 17:30 = 537min, minus 60min unpaid break
    expect(result.workedMinutes).toBe(537 - 60);
  });

  it("marks late when clocking in past the grace period", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("09:10"),
      clockOut: at("17:30"),
    });
    expect(result.status).toBe("late");
    expect(result.lateMinutes).toBe(35); // 09:10 - 08:30 - 5min grace
  });

  it("marks early leave when clocking out before shift end", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:30"),
      clockOut: at("16:00"),
    });
    expect(result.status).toBe("early_leave");
    expect(result.earlyLeaveMinutes).toBe(90);
  });

  it("flags a missing clock-out for HR review instead of guessing hours worked", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:30"),
      clockOut: null,
    });
    expect(result.needsReview).toBe(true);
    expect(result.reviewNote).toBe("missing_clock_out");
    expect(result.workedMinutes).toBe(0);
  });

  it("marks absent when there is no clock-in at all on a scheduled day", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: null,
      clockOut: null,
    });
    expect(result.status).toBe("absent");
    expect(result.needsReview).toBe(true);
  });

  it("handles an overnight shift crossing midnight", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: nightShift,
      clockIn: at("22:00"),
      clockOut: at("06:00", 1),
    });
    expect(result.status).toBe("on_time");
    expect(result.workedMinutes).toBe(8 * 60 - 60);
  });

  it("deducts multiple unpaid breaks from worked minutes", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: { ...normalShift, unpaidBreakMinutes: 0 },
      clockIn: at("08:30"),
      clockOut: at("17:30"),
      breaks: [
        { start: at("12:00"), end: at("12:30") },
        { start: at("15:00"), end: at("15:15") },
      ],
    });
    // 9h shift minus 30min + 15min breaks = 495min
    expect(result.workedMinutes).toBe(9 * 60 - 45);
  });

  it("treats a full-day approved leave as a leave day with no time computation", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: null,
      clockOut: null,
      isOnApprovedLeave: true,
      leaveIsFullDay: true,
    });
    expect(result.status).toBe("leave");
    expect(result.needsReview).toBe(false);
  });

  it("computes worked hours normally for a half-day leave (afternoon worked)", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("13:00"),
      clockOut: at("17:30"),
      isOnApprovedLeave: true,
      leaveIsFullDay: false,
    });
    expect(result.status).toBe("on_time");
    expect(result.workedMinutes).toBeGreaterThan(0);
  });

  it("captures OT worked on a company holiday", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: null,
      clockIn: at("09:00"),
      clockOut: at("13:00"),
      isHoliday: true,
    });
    expect(result.status).toBe("holiday");
    expect(result.otMinutes).toBe(4 * 60);
    expect(result.needsReview).toBe(true);
  });

  it("marks a day off-site distinctly from a normal shift", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:30"),
      clockOut: at("17:30"),
      isOffSite: true,
    });
    expect(result.status).toBe("off_site");
  });

  it("flags offline-submitted attendance for HR review even when the times look normal", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:30"),
      clockOut: at("17:30"),
      isOfflineSubmission: true,
    });
    expect(result.status).toBe("on_time");
    expect(result.needsReview).toBe(true);
    expect(result.reviewNote).toBe("offline_submission_pending_verification");
  });

  it("computes OT minutes worked after a normal shift ends", () => {
    const result = computeAttendance({
      workDate: WORK_DATE,
      shift: normalShift,
      clockIn: at("08:30"),
      clockOut: at("19:30"),
    });
    expect(result.otMinutes).toBe(120);
  });
});
