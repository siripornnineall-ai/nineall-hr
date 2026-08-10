export type UserRole = "super_admin" | "hr" | "manager" | "employee" | "payroll_admin";
export type EmploymentType = "monthly" | "daily" | "hourly" | "part_time" | "contract";
export type EmploymentStatus = "active" | "probation" | "suspended" | "resigned" | "terminated";
export type AttendanceStatus =
  | "on_time"
  | "late"
  | "early_leave"
  | "absent"
  | "holiday"
  | "leave"
  | "work_from_home"
  | "off_site"
  | "pending_offline";
export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected" | "cancelled";
export type LeaveUnit = "full_day" | "half_day" | "hourly";
export type PayrollRunStatus = "draft" | "under_review" | "pending_approval" | "approved" | "paid" | "locked";
export type TimeCorrectionReason =
  | "forgot_clock_in"
  | "forgot_clock_out"
  | "wrong_time"
  | "off_site_work"
  | "device_issue"
  | "other";

export interface Organization {
  id: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  logoUrl?: string | null;
  timezone: string;
  defaultCurrency: string;
  defaultLanguage: string;
}

export interface Branch {
  id: string;
  orgId: string;
  name: string;
  address?: string | null;
}

export interface WorkLocation {
  id: string;
  orgId: string;
  branchId?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface Department {
  id: string;
  orgId: string;
  name: string;
  nameEn?: string | null;
  colorHex?: string | null;
}

export interface Team {
  id: string;
  orgId: string;
  departmentId?: string | null;
  name: string;
  managerEmployeeId?: string | null;
}

export interface JobPosition {
  id: string;
  orgId: string;
  title: string;
  titleEn?: string | null;
  departmentId?: string | null;
}

export interface Employee {
  id: string;
  orgId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  nickname?: string | null;
  photoUrl?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  branchId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
  jobPositionId?: string | null;
  managerEmployeeId?: string | null;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  probationEndDate?: string | null;
  resignationDate?: string | null;
  terminationDate?: string | null;
}

export interface Profile {
  id: string;
  orgId: string;
  employeeId: string;
  role: UserRole;
  fullName: string;
  email?: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
}

export interface WorkShift {
  id: string;
  orgId: string;
  name: string;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  graceMinutesLate: number;
  graceMinutesEarlyLeave: number;
  otBeforeShiftAllowed: boolean;
  otAfterShiftAllowed: boolean;
  roundToMinutes: number;
}

export interface AttendanceRecord {
  id: string;
  orgId: string;
  employeeId: string;
  workDate: string;
  shiftId?: string | null;
  workLocationId?: string | null;
  clockInServerAt?: string | null;
  clockInLatitude?: number | null;
  clockInLongitude?: number | null;
  clockInDistanceM?: number | null;
  clockInWithinGeofence?: boolean | null;
  clockInSelfiePath?: string | null;
  clockOutServerAt?: string | null;
  clockOutSelfiePath?: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  otMinutes: number;
  needsReview: boolean;
}

export interface LeaveType {
  id: string;
  orgId: string;
  code: string;
  nameTh: string;
  nameEn?: string | null;
  isPaid: boolean;
  isActive: boolean;
}

export interface LeaveBalance {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  entitledDays: number;
  carriedOverDays: number;
  usedDays: number;
  pendingDays: number;
}

export interface LeaveRequest {
  id: string;
  orgId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  unit: LeaveUnit;
  totalDays: number;
  reason?: string | null;
  delegateEmployeeId?: string | null;
  attachmentFilePath?: string | null;
  status: ApprovalStatus;
}

export interface OvertimeRequest {
  id: string;
  orgId: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  requestedHours: number;
  approvedHours?: number | null;
  rateMultiplier: number;
  reason?: string | null;
  taskDescription?: string | null;
  status: ApprovalStatus;
}

export interface TimeCorrectionRequest {
  id: string;
  orgId: string;
  employeeId: string;
  workDate: string;
  requestedClockIn?: string | null;
  requestedClockOut?: string | null;
  reasonType: TimeCorrectionReason;
  reasonNote?: string | null;
  status: ApprovalStatus;
}

export interface PayrollPeriod {
  id: string;
  orgId: string;
  label: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
}

export interface PayrollRun {
  id: string;
  orgId: string;
  payrollPeriodId: string;
  status: PayrollRunStatus;
  employeeCount: number;
  totalNetAmount: number;
}

export interface PayrollEmployeeCalculation {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCodeSnapshot: string;
  employeeNameSnapshot: string;
  baseAmount: number;
  otHours: number;
  otAmount: number;
  grossEarnings: number;
  totalDeductions: number;
  socialSecurityAmount: number;
  taxAmount: number;
  netPay: number;
  hasAnomaly: boolean;
  anomalyNotes?: string | null;
}

export interface Payslip {
  id: string;
  payrollCalcId: string;
  employeeId: string;
  payrollPeriodId: string;
  pdfFilePath?: string | null;
  issuedAt?: string | null;
}

export interface Announcement {
  id: string;
  orgId: string;
  title: string;
  body: string;
  publishAt: string;
  expireAt?: string | null;
  status: string;
}

export interface AppNotification {
  id: string;
  profileId: string;
  type: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  createdAt: string;
}
