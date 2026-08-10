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
  branchId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  jobPositionId: z.string().uuid().optional(),
  managerEmployeeId: z.string().uuid().optional(),
  employmentType: z.enum(["monthly", "daily", "hourly", "part_time", "contract"]),
  hireDate: z.string().min(1, "กรุณาระบุวันที่เริ่มงาน"),
  baseAmountBaht: z.number().positive("เงินเดือน/อัตราค่าจ้างต้องมากกว่า 0"),
});
export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const leaveRequestSchema = z
  .object({
    leaveTypeId: z.string().uuid("กรุณาเลือกประเภทการลา"),
    startDate: z.string().min(1, "กรุณาระบุวันที่เริ่มลา"),
    endDate: z.string().min(1, "กรุณาระบุวันที่สิ้นสุดการลา"),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    unit: z.enum(["full_day", "half_day", "hourly"]),
    reason: z.string().min(1, "กรุณาระบุเหตุผลการลา"),
    delegateEmployeeId: z.string().uuid().optional(),
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
  workLocationId: z.string().uuid().optional(),
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
  targetIds: z.array(z.string().uuid()).optional(),
  publishAt: z.string().optional(),
  expireAt: z.string().optional(),
});
export type AnnouncementInput = z.infer<typeof announcementSchema>;
