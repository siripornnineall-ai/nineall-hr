import type { Satang } from "./money";

export interface ShiftConfig {
  /** "HH:mm" in shift-local (Asia/Bangkok) time. */
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  graceMinutesLate: number;
  graceMinutesEarlyLeave: number;
  minWorkMinutes: number;
  otBeforeShiftAllowed: boolean;
  otAfterShiftAllowed: boolean;
  roundToMinutes: number;
}

export type AttendanceStatus =
  | "on_time"
  | "late"
  | "early_leave"
  | "absent"
  | "holiday"
  | "leave"
  | "work_from_home"
  | "off_site"
  | "pending_offline"
  | "day_off";

export interface AttendanceInput {
  workDate: string; // "YYYY-MM-DD"
  shift: ShiftConfig | null;
  clockIn: Date | null;
  clockOut: Date | null;
  isHoliday?: boolean;
  isOnApprovedLeave?: boolean;
  leaveIsFullDay?: boolean;
  isWorkFromHome?: boolean;
  isOffSite?: boolean;
  isOfflineSubmission?: boolean;
  breaks?: { start: Date; end: Date | null }[];
}

export interface AttendanceResult {
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  otMinutes: number;
  needsReview: boolean;
  reviewNote?: string;
}

export type EmploymentType = "monthly" | "daily" | "hourly" | "part_time" | "contract";

export interface EarningLine {
  label: string;
  quantity?: number;
  rate?: number;
  amountSatang: Satang;
  note?: string;
}

export interface DeductionLine {
  label: string;
  quantity?: number;
  rate?: number;
  amountSatang: Satang;
  note?: string;
}

export interface SocialSecurityConfig {
  employeeRate: number; // e.g. 0.05
  minBaseSatang: Satang;
  maxContributionSatang: Satang;
}

export interface TaxBracket {
  /** Annual taxable income upper bound in satang, or null for the top-open bracket. */
  uptoSatang: Satang | null;
  rate: number;
}

export interface PayrollPolicyConfig {
  socialSecurity: SocialSecurityConfig;
  taxBrackets: TaxBracket[];
  otRateMultipliers: { normal: number; holiday: number };
}

export interface PayrollInputDay {
  workDate: string;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  isScheduledWorkday: boolean;
}

export interface OvertimeInputItem {
  workDate: string;
  approvedHours: number;
  rateMultiplier: number;
}

export interface UnpaidLeaveInputItem {
  days: number;
}

export interface PayrollEmployeeInput {
  employmentType: EmploymentType;
  /** Monthly salary, or daily/hourly rate, in satang, effective for this period. */
  baseAmountSatang: Satang;
  periodStart: string;
  periodEnd: string;
  scheduledWorkDaysInPeriod: number;
  /**
   * For daily-wage employees only: count of dates still ahead in the period (after
   * "today") where they're scheduled to work (not a day off), used to project pay when
   * payroll is run before the period has actually finished — e.g. running it 3 days
   * before month-end still pays for those 3 days if they're normal scheduled workdays.
   * Days off in that remaining stretch are correctly excluded, not assumed worked.
   */
  remainingScheduledWorkDays?: number;
  hireDate?: string;
  resignationDate?: string;
  days: PayrollInputDay[];
  overtime: OvertimeInputItem[];
  unpaidLeaveDays: number;
  recurringEarnings?: EarningLine[];
  oneTimeEarnings?: EarningLine[];
  oneTimeDeductions?: EarningLine[];
  latePenaltyPerMinuteSatang?: number;
  absentPenaltyPerDaySatang?: number;
  policy: PayrollPolicyConfig;
}

export interface PayrollEmployeeResult {
  baseAmountSatang: Satang;
  proratedBaseSatang: Satang;
  earnings: EarningLine[];
  deductions: DeductionLine[];
  grossEarningsSatang: Satang;
  totalDeductionsSatang: Satang;
  socialSecuritySatang: Satang;
  taxSatang: Satang;
  netPaySatang: Satang;
  otHours: number;
  otAmountSatang: Satang;
  isMidCycleJoin: boolean;
  isMidCycleExit: boolean;
  hasAnomaly: boolean;
  anomalyNotes: string[];
}
