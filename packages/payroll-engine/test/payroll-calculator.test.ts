import { describe, expect, it } from "vitest";
import { calculatePayrollForEmployee } from "../src/payroll-calculator";
import { bahtToSatang, satangToBaht } from "../src/money";
import type { PayrollEmployeeInput, PayrollPolicyConfig } from "../src/types";

const policy: PayrollPolicyConfig = {
  socialSecurity: {
    employeeRate: 0.05,
    minBaseSatang: bahtToSatang(1650),
    maxContributionSatang: bahtToSatang(750),
  },
  taxBrackets: [
    { uptoSatang: bahtToSatang(150_000), rate: 0 },
    { uptoSatang: bahtToSatang(500_000), rate: 0.1 },
    { uptoSatang: null, rate: 0.2 },
  ],
  otRateMultipliers: { normal: 1.5, holiday: 3 },
};

function baseInput(overrides: Partial<PayrollEmployeeInput> = {}): PayrollEmployeeInput {
  return {
    employmentType: "monthly",
    baseAmountSatang: bahtToSatang(30_000),
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    scheduledWorkDaysInPeriod: 22,
    days: [],
    overtime: [],
    unpaidLeaveDays: 0,
    policy,
    ...overrides,
  };
}

describe("calculatePayrollForEmployee", () => {
  it("pays the full monthly base when there is no mid-cycle join/exit or deductions", () => {
    const result = calculatePayrollForEmployee(baseInput());
    expect(result.proratedBaseSatang).toBe(bahtToSatang(30_000));
    expect(result.isMidCycleJoin).toBe(false);
    expect(result.netPaySatang).toBeLessThan(result.grossEarningsSatang);
    expect(result.hasAnomaly).toBe(false);
  });

  it("prorates base salary for a mid-cycle joiner", () => {
    const result = calculatePayrollForEmployee(
      baseInput({ hireDate: "2026-08-16", periodStart: "2026-08-01", periodEnd: "2026-08-31" })
    );
    expect(result.isMidCycleJoin).toBe(true);
    // 16 days employed out of the standard 30-day month convention — not the calendar's
    // actual day count, so the same half-month doesn't pay differently in a 30- vs 31-day
    // month.
    expect(satangToBaht(result.proratedBaseSatang)).toBeCloseTo((30_000 * 16) / 30, 0);
  });

  it("deducts unpaid leave days at the prorated daily rate", () => {
    const result = calculatePayrollForEmployee(baseInput({ unpaidLeaveDays: 2 }));
    const dailyRate = bahtToSatang(30_000) / 22;
    const deduction = result.deductions.find((d) => d.label === "ลาไม่รับค่าจ้าง");
    expect(deduction?.amountSatang).toBeCloseTo(Math.round(dailyRate * 2), -1);
  });

  it("only pays overtime that was actually approved", () => {
    const result = calculatePayrollForEmployee(
      baseInput({
        overtime: [{ workDate: "2026-08-05", approvedHours: 3, rateMultiplier: 1.5 }],
      })
    );
    expect(result.otHours).toBe(3);
    expect(result.otAmountSatang).toBeGreaterThan(0);
    const otLine = result.earnings.find((e) => e.label.includes("OT"));
    expect(otLine).toBeDefined();
  });

  it("flags negative net pay as an anomaly instead of silently approving it", () => {
    const result = calculatePayrollForEmployee(
      baseInput({
        baseAmountSatang: bahtToSatang(1_000),
        oneTimeDeductions: [{ label: "เงินกู้", amountSatang: bahtToSatang(5_000) }],
      })
    );
    expect(result.netPaySatang).toBeLessThan(0);
    expect(result.hasAnomaly).toBe(true);
    expect(result.anomalyNotes.some((n) => n.includes("ติดลบ"))).toBe(true);
  });

  it("caps social security contribution at the configured maximum", () => {
    const result = calculatePayrollForEmployee(baseInput({ baseAmountSatang: bahtToSatang(100_000) }));
    expect(result.socialSecuritySatang).toBe(bahtToSatang(750));
  });

  it("pays daily-wage employees only for days actually worked", () => {
    const result = calculatePayrollForEmployee(
      baseInput({
        employmentType: "daily",
        baseAmountSatang: bahtToSatang(500),
        days: [
          { workDate: "2026-08-01", status: "on_time", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, isScheduledWorkday: true },
          { workDate: "2026-08-02", status: "absent", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 0, isScheduledWorkday: true },
          { workDate: "2026-08-03", status: "on_time", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, isScheduledWorkday: true },
        ],
      })
    );
    expect(result.proratedBaseSatang).toBe(bahtToSatang(1_000));
  });

  it("projects pay for a daily-wage employee's remaining scheduled workdays when run early", () => {
    const result = calculatePayrollForEmployee(
      baseInput({
        employmentType: "daily",
        baseAmountSatang: bahtToSatang(500),
        remainingScheduledWorkDays: 3,
        days: [{ workDate: "2026-08-01", status: "on_time", lateMinutes: 0, earlyLeaveMinutes: 0, workedMinutes: 480, isScheduledWorkday: true }],
      })
    );
    // 1 actual day worked + 3 projected scheduled days ahead
    expect(result.proratedBaseSatang).toBe(bahtToSatang(2_000));
  });

  it("flags absenteeism above the sanity threshold for HR review", () => {
    const days = Array.from({ length: 5 }, (_, i) => ({
      workDate: `2026-08-0${i + 1}`,
      status: "absent" as const,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: 0,
      isScheduledWorkday: true,
    }));
    const result = calculatePayrollForEmployee(baseInput({ days, absentPenaltyPerDaySatang: bahtToSatang(500) }));
    expect(result.hasAnomaly).toBe(true);
    expect(result.deductions.find((d) => d.label === "ขาดงาน")?.amountSatang).toBe(bahtToSatang(2500));
  });
});
