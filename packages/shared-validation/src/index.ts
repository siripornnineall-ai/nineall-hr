import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().min(1, "กรุณากรอกอีเมลหรือรหัสพนักงาน"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const employeeCreateSchema = z.object({
  employeeCode: z.string().min(1, "กรุณากรอกรหัสพนักงาน"),
  firstName: z.string().min(1, "กรุณากรอกชื่อ"),
  lastName: z.string().min(1, "กรุณากรอกนามสกุล"),
  nickname: z.string().optional(),
  phone: z.string().min(9, "เบอร์โทรไม่ถูกต้อง").optional().or(z.literal("")),
  personalEmail: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  // Not .uuid(): Zod's format check enforces real RFC4122 version/variant nibbles, but this
  // project's seed data uses simplified placeholder ids (e.g. 00000000-...-000000000303) that
  // fail it. These values come from server-rendered <select> options (not free text), so the
  // real integrity guard is the database foreign key, not client-side format validation.
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  jobPositionId: z.string().optional(),
  managerEmployeeId: z.string().optional(),
  employmentType: z.enum(["monthly", "daily", "hourly", "part_time", "contract"]),
  hireDate: z.string().min(1, "กรุณาระบุวันที่เริ่มงาน"),
  baseAmountBaht: z.number().positive("เงินเดือน/อัตราค่าจ้างต้องมากกว่า 0"),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = z.object({
  employeeCode: z.string().min(1, "กรุณากรอกรหัสพนักงาน"),
  firstName: z.string().min(1, "กรุณากรอกชื่อ"),
  lastName: z.string().min(1, "กรุณากรอกนามสกุล"),
  nickname: z.string().optional(),
  phone: z.string().min(9, "เบอร์โทรไม่ถูกต้อง").optional().or(z.literal("")),
  personalEmail: z.string().email("อีเมลไม่ถูกต้อง").optional().or(z.literal("")),
  // Not .uuid(): Zod's format check enforces real RFC4122 version/variant nibbles, but this
  // project's seed data uses simplified placeholder ids (e.g. 00000000-...-000000000303) that
  // fail it. These values come from server-rendered <select> options (not free text), so the
  // real integrity guard is the database foreign key, not client-side format validation.
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  jobPositionId: z.string().optional(),
  managerEmployeeId: z.string().optional(),
  employmentType: z.enum(["monthly", "daily", "hourly", "part_time", "contract"]),
  hireDate: z.string().min(1, "กรุณาระบุวันที่เริ่มงาน"),
  newBaseAmountBaht: z.number().positive("เงินเดือน/อัตราค่าจ้างต้องมากกว่า 0").optional(),
});
export type EmployeeUpdateInput = z.infer<typeof employeeUpdateSchema>;

export const leaveRequestSchema = z
  .object({
    leaveTypeId: z.string().min(1, "กรุณาเลือกประเภทการลา"),
    startDate: z.string().min(1, "กรุณาระบุวันที่เริ่มลา"),
    endDate: z.string().min(1, "กรุณาระบุวันที่สิ้นสุดการลา"),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    unit: z.enum(["full_day", "half_day", "hourly"]),
    reason: z.string().min(1, "กรุณาระบุเหตุผลการลา"),
    delegateEmployeeId: z.string().optional(),
    attachmentFilePath: z.string().optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา",
    path: ["endDate"],
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const overtimeRequestSchema = z.object({
  workDate: z.string().min(1, "กรุณาระบุวันที่"),
  startTime: z.string().min(1, "กรุณาระบุเวลาเริ่ม"),
  endTime: z.string().min(1, "กรุณาระบุเวลาสิ้นสุด"),
  requestedHours: z.number().positive("จำนวนชั่วโมงต้องมากกว่า 0").max(24),
  reason: z.string().min(1, "กรุณาระบุเหตุผล"),
  taskDescription: z.string().optional(),
  attachmentFilePath: z.string().optional(),
});
export type OvertimeRequestInput = z.infer<typeof overtimeRequestSchema>;

export const timeCorrectionRequestSchema = z.object({
  workDate: z.string().min(1, "กรุณาระบุวันที่"),
  requestedClockIn: z.string().optional(),
  requestedClockOut: z.string().optional(),
  reasonType: z.enum(["forgot_clock_in", "forgot_clock_out", "wrong_time", "off_site_work", "device_issue", "other"]),
  reasonNote: z.string().min(1, "กรุณาระบุเหตุผล"),
  evidenceFilePath: z.string().optional(),
});
export type TimeCorrectionRequestInput = z.infer<typeof timeCorrectionRequestSchema>;

export const clockInPayloadSchema = z.object({
  workLocationId: z.string().optional(),
  deviceAt: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative(),
  selfiePath: z.string().min(1, "กรุณาถ่ายเซลฟีเพื่อยืนยันตัวตน"),
  deviceId: z.string().optional(),
  isOfflineSubmission: z.boolean().default(false),
});
export type ClockInPayload = z.infer<typeof clockInPayloadSchema>;

export const approvalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  comment: z.string().optional(),
});
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

export const leaveTypeSchema = z.object({
  code: z.string().min(1),
  nameTh: z.string().min(1, "กรุณากรอกชื่อประเภทการลา"),
  nameEn: z.string().optional(),
  isPaid: z.boolean().default(true),
  daysPerYear: z.number().nonnegative(),
  minServiceMonths: z.number().nonnegative().default(0),
  noticeDaysRequired: z.number().nonnegative().default(0),
  requiresAttachment: z.boolean().default(false),
  allowHalfDay: z.boolean().default(true),
  allowHourly: z.boolean().default(false),
  carryOverAllowed: z.boolean().default(false),
  carryOverMaxDays: z.number().nonnegative().default(0),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

export const announcementSchema = z.object({
  title: z.string().min(1, "กรุณากรอกหัวข้อประกาศ"),
  body: z.string().min(1, "กรุณากรอกเนื้อหาประกาศ"),
  targetType: z.enum(["all", "branch", "department", "team", "employee"]).default("all"),
  targetIds: z.array(z.string()).optional(),
  publishAt: z.string().optional(),
  expireAt: z.string().optional(),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;

// Thai 13-digit IDs (citizen ID, tax ID, and — for most employees — the Social
// Security Office member number, which is just the citizen ID) are conventionally
// displayed with dashes as 1-2345-67890-12-3. Only formats when there are exactly 13
// digits, so a foreign hire's passport number (letters, different length) is left
// exactly as typed.
export function formatThaiId13(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 13) return raw.trim();
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

// Most Thai banks group a 10-digit account number as XXX-X-XXXXX-X (3-1-5-1). Exact
// grouping conventions vary slightly by bank (e.g. SCB's own passbooks show 3-6-1),
// but this is purely a display separator — the underlying digits are never changed —
// so the common pattern is used for every bank rather than hardcoding all ~18 banks'
// individual conventions.
export function formatThaiBankAccount(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 10) return raw.trim();
  return `${digits.slice(0, 3)}-${digits[3]}-${digits.slice(4, 9)}-${digits[9]}`;
}
