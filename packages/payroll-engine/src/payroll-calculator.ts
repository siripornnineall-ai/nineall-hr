import { addSatang, mulSatang, prorateSatang, subSatang } from "./money";
import type {
  DeductionLine,
  EarningLine,
  PayrollEmployeeInput,
  PayrollEmployeeResult,
  PayrollPolicyConfig,
} from "./types";

const STANDARD_HOURS_PER_DAY = 8;

function daysBetweenInclusive(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  return Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

function computeHourlyRateSatang(input: PayrollEmployeeInput): number {
  const { employmentType, baseAmountSatang, scheduledWorkDaysInPeriod } = input;
  if (employmentType === "hourly") return baseAmountSatang;
  if (employmentType === "daily") return Math.round(baseAmountSatang / STANDARD_HOURS_PER_DAY);
  // monthly / part_time / contract: derive an hourly-equivalent from the period's schedule.
  if (scheduledWorkDaysInPeriod <= 0) return 0;
  return Math.round(baseAmountSatang / scheduledWorkDaysInPeriod / STANDARD_HOURS_PER_DAY);
}

function computeDailyRateSatang(input: PayrollEmployeeInput): number {
  const { employmentType, baseAmountSatang, scheduledWorkDaysInPeriod } = input;
  if (employmentType === "daily") return baseAmountSatang;
  if (employmentType === "hourly") return baseAmountSatang * STANDARD_HOURS_PER_DAY;
  if (scheduledWorkDaysInPeriod <= 0) return 0;
  return Math.round(baseAmountSatang / scheduledWorkDaysInPeriod);
}

const WORKED_STATUSES = new Set(["on_time", "late", "early_leave", "work_from_home", "off_site", "holiday"]);

function computeProratedBase(input: PayrollEmployeeInput): {
  proratedBaseSatang: number;
  isMidCycleJoin: boolean;
  isMidCycleExit: boolean;
} {
  const { employmentType, baseAmountSatang, periodStart, periodEnd, hireDate, resignationDate } = input;
  const totalCalendarDays = daysBetweenInclusive(periodStart, periodEnd);

  const isMidCycleJoin = Boolean(hireDate && hireDate > periodStart);
  const isMidCycleExit = Boolean(resignationDate && resignationDate < periodEnd);

  if (employmentType === "daily" || employmentType === "hourly" || employmentType === "part_time") {
    const dailyRate = computeDailyRateSatang(input);
    const workedDays = input.days.filter((d) => WORKED_STATUSES.has(d.status)).length;
    if (employmentType === "hourly") {
      const totalHours = input.days.reduce((sum, d) => sum + d.workedMinutes / 60, 0);
      return { proratedBaseSatang: Math.round(baseAmountSatang * totalHours), isMidCycleJoin, isMidCycleExit };
    }
    return { proratedBaseSatang: dailyRate * workedDays, isMidCycleJoin, isMidCycleExit };
  }

  if (employmentType === "contract") {
    return { proratedBaseSatang: baseAmountSatang, isMidCycleJoin, isMidCycleExit };
  }

  // monthly
  if (!isMidCycleJoin && !isMidCycleExit) {
    return { proratedBaseSatang: baseAmountSatang, isMidCycleJoin, isMidCycleExit };
  }
  const effectiveStart = isMidCycleJoin && hireDate ? hireDate : periodStart;
  const effectiveEnd = isMidCycleExit && resignationDate ? resignationDate : periodEnd;
  const employedDays = Math.max(0, daysBetweenInclusive(effectiveStart, effectiveEnd));
  return {
    proratedBaseSatang: prorateSatang(baseAmountSatang, employedDays, totalCalendarDays),
    isMidCycleJoin,
    isMidCycleExit,
  };
}

function computeSocialSecurity(grossEarningsSatang: number, policy: PayrollPolicyConfig["socialSecurity"]): number {
  const base = Math.max(policy.minBaseSatang, Math.min(grossEarningsSatang, policy.maxContributionSatang / policy.employeeRate));
  return Math.min(mulSatang(base, policy.employeeRate), policy.maxContributionSatang);
}

/**
 * Simplified withholding-tax estimate for section 40(1) income (regular employment
 * salary/wages): annualizes the prorated BASE salary only — not OT, allowances, or other
 * one-off earnings, which fall under section 40(2) and aren't predictable enough to
 * annualize the same way — applies the configured progressive brackets, then divides by
 * 12. This ignores personal allowances/deductions and must be reviewed by an accountant
 * before production use — see docs/PAYROLL_RULES.md. Never treat this as authoritative
 * Thai PIT law. Any 40(2) withholding on other benefits is entered by HR by hand.
 */
function computeTax(baseSatang: number, brackets: PayrollPolicyConfig["taxBrackets"]): number {
  const annualIncome = baseSatang * 12;
  let remaining = annualIncome;
  let lowerBound = 0;
  let annualTax = 0;

  for (const bracket of brackets) {
    const upper = bracket.uptoSatang ?? Infinity;
    const bandWidth = upper - lowerBound;
    const taxableInBand = Math.max(0, Math.min(remaining, bandWidth));
    annualTax += mulSatang(taxableInBand, bracket.rate);
    remaining -= taxableInBand;
    lowerBound = upper;
    if (remaining <= 0) break;
  }

  return Math.round(annualTax / 12);
}

export function calculatePayrollForEmployee(input: PayrollEmployeeInput): PayrollEmployeeResult {
  const anomalyNotes: string[] = [];
  const { proratedBaseSatang, isMidCycleJoin, isMidCycleExit } = computeProratedBase(input);

  const dailyRate = computeDailyRateSatang(input);
  const hourlyRate = computeHourlyRateSatang(input);

  const earnings: EarningLine[] = [];
  const deductions: DeductionLine[] = [];

  for (const e of input.recurringEarnings ?? []) earnings.push(e);
  for (const e of input.oneTimeEarnings ?? []) earnings.push(e);

  const otHours = input.overtime.reduce((sum, o) => sum + o.approvedHours, 0);
  let otAmountSatang = 0;
  for (const ot of input.overtime) {
    const amount = Math.round(hourlyRate * ot.approvedHours * ot.rateMultiplier);
    otAmountSatang += amount;
  }
  if (otHours > 0) {
    earnings.push({ label: "ค่าล่วงเวลา (OT)", quantity: otHours, amountSatang: otAmountSatang });
  }
  if (otHours > 100) {
    anomalyNotes.push(`OT ${otHours} ชั่วโมงในรอบนี้สูงผิดปกติ (เกิน 100 ชม.)`);
  }

  if (input.unpaidLeaveDays > 0) {
    const amount = dailyRate * input.unpaidLeaveDays;
    deductions.push({ label: "ลาไม่รับค่าจ้าง", quantity: input.unpaidLeaveDays, rate: dailyRate, amountSatang: amount });
  }

  const absentDays = input.days.filter((d) => d.status === "absent" && d.isScheduledWorkday).length;
  if (absentDays > 0 && input.absentPenaltyPerDaySatang) {
    const amount = input.absentPenaltyPerDaySatang * absentDays;
    deductions.push({ label: "ขาดงาน", quantity: absentDays, rate: input.absentPenaltyPerDaySatang, amountSatang: amount });
  }
  if (absentDays > 3) {
    anomalyNotes.push(`ขาดงาน ${absentDays} วันในรอบนี้ ควรตรวจสอบก่อนอนุมัติ`);
  }

  const totalLateMinutes = input.days.reduce((sum, d) => sum + d.lateMinutes, 0);
  if (totalLateMinutes > 0 && input.latePenaltyPerMinuteSatang) {
    const amount = Math.round(input.latePenaltyPerMinuteSatang * totalLateMinutes);
    deductions.push({ label: "มาสาย", quantity: totalLateMinutes, rate: input.latePenaltyPerMinuteSatang, amountSatang: amount });
  }

  for (const d of input.oneTimeDeductions ?? []) deductions.push(d);

  const grossEarningsSatang = addSatang(proratedBaseSatang, ...earnings.map((e) => e.amountSatang));
  const preStatutoryDeductionsSatang = addSatang(...deductions.map((d) => d.amountSatang));

  // Social security contribution is based on wages (base salary) only, per Thai SSO
  // rules — OT pay and other earnings on top of it don't count toward the base, unlike
  // withholding tax below which is computed on the full gross.
  const socialSecuritySatang = computeSocialSecurity(proratedBaseSatang, input.policy.socialSecurity);
  const taxSatang = computeTax(proratedBaseSatang, input.policy.taxBrackets);

  const totalDeductionsSatang = addSatang(preStatutoryDeductionsSatang, socialSecuritySatang, taxSatang);
  const netPaySatang = subSatang(grossEarningsSatang, totalDeductionsSatang);

  if (netPaySatang < 0) {
    anomalyNotes.push("ยอดสุทธิติดลบ — รายการหักมากกว่ารายได้ ต้องตรวจสอบก่อนอนุมัติ");
  }
  if (input.scheduledWorkDaysInPeriod <= 0 && input.employmentType === "monthly") {
    anomalyNotes.push("ไม่พบวันทำงานตามตารางในรอบนี้ (scheduledWorkDaysInPeriod = 0)");
  }

  return {
    baseAmountSatang: input.baseAmountSatang,
    proratedBaseSatang,
    earnings,
    deductions,
    grossEarningsSatang,
    totalDeductionsSatang,
    socialSecuritySatang,
    taxSatang,
    netPaySatang,
    otHours,
    otAmountSatang,
    isMidCycleJoin,
    isMidCycleExit,
    hasAnomaly: anomalyNotes.length > 0,
    anomalyNotes,
  };
}
