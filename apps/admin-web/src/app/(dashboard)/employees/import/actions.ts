"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calculateProbationEndDate } from "@/lib/probation";
import { grantLeaveBalancesForEmployee, createEmployeeLoginAccount } from "../actions";

const EMPLOYMENT_TYPE_TH_TO_EN: Record<string, string> = {
  ประจำ: "monthly",
  รายวัน: "daily",
  รายชั่วโมง: "hourly",
  พาร์ทไทม์: "part_time",
  สัญญาจ้าง: "contract",
};

const TEMPLATE_HEADERS = [
  "รหัสพนักงาน*",
  "คำนำหน้าชื่อ",
  "ชื่อ*",
  "นามสกุล*",
  "ชื่อภาษาอังกฤษ",
  "นามสกุลภาษาอังกฤษ",
  "ชื่อเล่น",
  "เพศ",
  "เบอร์โทร",
  "อีเมลส่วนตัว",
  "วันที่เริ่มงาน* (YYYY-MM-DD)",
  "แผนก",
  "ตำแหน่ง",
  "ประเภทการจ้าง* (ประจำ/รายวัน/รายชั่วโมง/พาร์ทไทม์/สัญญาจ้าง)",
  "เงินเดือน/อัตราค่าจ้าง*",
  "สร้างบัญชีเข้าสู่ระบบ (ใช่/ไม่ใช่)",
  "อีเมลเข้าสู่ระบบ",
  "รหัสผ่านเริ่มต้น",
];

export async function downloadEmployeeImportTemplateAction(): Promise<{ error?: string; base64?: string; filename?: string }> {
  await requireUser();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("พนักงาน");
  sheet.addRow(TEMPLATE_HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    "90099",
    "นางสาว",
    "สมหญิง",
    "ใจดี",
    "Somying",
    "Jaidee",
    "หญิง",
    "หญิง",
    "0812345678",
    "somying@example.com",
    "2026-01-15",
    "การตลาด",
    "เจ้าหน้าที่การตลาด",
    "ประจำ",
    "15000",
    "ใช่",
    "somying@gmail.com",
    "Nineall123",
  ]);
  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { base64: Buffer.from(buffer).toString("base64"), filename: "แบบฟอร์มนำเข้าพนักงาน.xlsx" };
}

export interface ImportRowData {
  employeeCode: string;
  firstName: string;
  lastName: string;
  firstNameEn: string | null;
  lastNameEn: string | null;
  nickname: string | null;
  titlePrefix: string | null;
  gender: string | null;
  phone: string | null;
  personalEmail: string | null;
  hireDate: string;
  departmentId: string | null;
  jobPositionId: string | null;
  employmentType: string;
  baseAmountBaht: number;
  createLogin: boolean;
  loginEmail: string | null;
  loginPassword: string | null;
}

export interface ImportRowResult {
  rowNumber: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  valid: boolean;
  errors: string[];
  data?: ImportRowData;
}

function cellText(row: ExcelJS.Row, col: number): string {
  const value = row.getCell(col).value;
  if (value == null) return "";
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  }
  return String(value).trim();
}

export async function parseEmployeeImportFileAction(formData: FormData): Promise<{ error?: string; rows?: ImportRowResult[] }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "กรุณาเลือกไฟล์" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's own `Buffer` type reference doesn't structurally match the newer
    // generic `Buffer<ArrayBuffer>` from this project's @types/node — same runtime type,
    // just a TS identity mismatch across the two packages' type declarations.
    await workbook.xlsx.load(buffer as never);
  } catch {
    return { error: "ไม่สามารถอ่านไฟล์นี้ได้ กรุณาใช้ไฟล์ .xlsx ที่ดาวน์โหลดจากเทมเพลต" };
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return { error: "ไม่พบข้อมูลในไฟล์" };

  const supabase = await createClient();
  const [{ data: departments }, { data: positions }, { data: existingEmployees }] = await Promise.all([
    supabase.from("departments").select("id, name").eq("org_id", user.orgId).is("deleted_at", null),
    supabase.from("job_positions").select("id, title").eq("org_id", user.orgId).is("deleted_at", null),
    supabase.from("employees").select("employee_code").eq("org_id", user.orgId).is("deleted_at", null),
  ]);
  const departmentByName = new Map((departments ?? []).map((d) => [d.name.trim().toLowerCase(), d.id]));
  const positionByTitle = new Map((positions ?? []).map((p) => [p.title.trim().toLowerCase(), p.id]));
  const existingCodes = new Set((existingEmployees ?? []).map((e) => e.employee_code));

  const rows: ImportRowResult[] = [];
  const seenCodesInFile = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header row

    const employeeCode = cellText(row, 1);
    const titlePrefix = cellText(row, 2);
    const firstName = cellText(row, 3);
    const lastName = cellText(row, 4);
    const firstNameEn = cellText(row, 5);
    const lastNameEn = cellText(row, 6);
    const nickname = cellText(row, 7);
    const gender = cellText(row, 8);
    const phone = cellText(row, 9);
    const personalEmail = cellText(row, 10);
    const hireDateCell = row.getCell(11).value;
    const departmentName = cellText(row, 12);
    const positionName = cellText(row, 13);
    const employmentTypeTh = cellText(row, 14);
    const baseAmountRaw = cellText(row, 15);
    const createLoginTh = cellText(row, 16);
    const loginEmail = cellText(row, 17);
    const loginPassword = cellText(row, 18);

    if (!employeeCode && !firstName && !lastName) return; // skip blank rows

    const errors: string[] = [];
    if (!employeeCode) errors.push("ไม่มีรหัสพนักงาน");
    if (!firstName) errors.push("ไม่มีชื่อ");
    if (!lastName) errors.push("ไม่มีนามสกุล");
    if (employeeCode && (existingCodes.has(employeeCode) || seenCodesInFile.has(employeeCode))) {
      errors.push(`รหัสพนักงาน ${employeeCode} ซ้ำ`);
    }
    if (employeeCode) seenCodesInFile.add(employeeCode);

    let hireDate = "";
    if (hireDateCell instanceof Date) {
      hireDate = hireDateCell.toISOString().slice(0, 10);
    } else {
      hireDate = String(hireDateCell ?? "").trim();
    }
    if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) errors.push("วันที่เริ่มงานไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)");

    const employmentType = EMPLOYMENT_TYPE_TH_TO_EN[employmentTypeTh];
    if (!employmentType) errors.push(`ประเภทการจ้าง "${employmentTypeTh || "-"}" ไม่ถูกต้อง`);

    const baseAmountBaht = Number(baseAmountRaw);
    if (!baseAmountRaw || !Number.isFinite(baseAmountBaht) || baseAmountBaht <= 0) errors.push("เงินเดือน/อัตราค่าจ้างไม่ถูกต้อง");

    let departmentId: string | null = null;
    if (departmentName) {
      departmentId = departmentByName.get(departmentName.toLowerCase()) ?? null;
      if (!departmentId) errors.push(`ไม่พบแผนก "${departmentName}"`);
    }
    let jobPositionId: string | null = null;
    if (positionName) {
      jobPositionId = positionByTitle.get(positionName.toLowerCase()) ?? null;
      if (!jobPositionId) errors.push(`ไม่พบตำแหน่ง "${positionName}"`);
    }

    const createLogin = createLoginTh === "ใช่" || createLoginTh.toLowerCase() === "y" || createLoginTh.toLowerCase() === "yes";
    if (createLogin) {
      if (!loginEmail) errors.push("ต้องกรอกอีเมลเข้าสู่ระบบถ้าจะสร้างบัญชี");
      if (!loginPassword || loginPassword.length < 8) errors.push("รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 8 ตัวอักษร");
    }

    rows.push({
      rowNumber,
      employeeCode,
      firstName,
      lastName,
      valid: errors.length === 0,
      errors,
      data:
        errors.length === 0
          ? {
              employeeCode,
              firstName,
              lastName,
              firstNameEn: firstNameEn || null,
              lastNameEn: lastNameEn || null,
              nickname: nickname || null,
              titlePrefix: titlePrefix || null,
              gender: gender || null,
              phone: phone || null,
              personalEmail: personalEmail || null,
              hireDate,
              departmentId,
              jobPositionId,
              employmentType,
              baseAmountBaht,
              createLogin,
              loginEmail: createLogin ? loginEmail : null,
              loginPassword: createLogin ? loginPassword : null,
            }
          : undefined,
    });
  });

  return { rows };
}

export interface BulkImportRowOutcome {
  employeeCode: string;
  success: boolean;
  error?: string;
}

export async function bulkImportEmployeesAction(rows: ImportRowData[]): Promise<{ error?: string; outcomes?: BulkImportRowOutcome[] }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const outcomes: BulkImportRowOutcome[] = [];
  const year = new Date().getFullYear();

  for (const row of rows) {
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .insert({
        org_id: user.orgId,
        employee_code: row.employeeCode,
        first_name: row.firstName,
        last_name: row.lastName,
        first_name_en: row.firstNameEn,
        last_name_en: row.lastNameEn,
        nickname: row.nickname,
        title_prefix: row.titlePrefix,
        gender: row.gender,
        phone: row.phone,
        personal_email: row.personalEmail,
        department_id: row.departmentId,
        job_position_id: row.jobPositionId,
        employment_type: row.employmentType,
        hire_date: row.hireDate,
        probation_end_date: calculateProbationEndDate(row.hireDate),
        created_by: user.profileId,
      })
      .select("id, employee_code")
      .single();

    if (empError || !employee) {
      outcomes.push({ employeeCode: row.employeeCode, success: false, error: `บันทึกพนักงานไม่สำเร็จ: ${empError?.message ?? "unknown error"}` });
      continue;
    }

    await supabase.from("employee_compensation").insert({
      employee_id: employee.id,
      effective_date: row.hireDate,
      employment_type: row.employmentType,
      base_amount: row.baseAmountBaht,
      created_by: user.profileId,
    });

    await grantLeaveBalancesForEmployee(supabase, employee.id, user.orgId, row.hireDate, year);

    if (row.createLogin && row.loginEmail && row.loginPassword) {
      const result = await createEmployeeLoginAccount(supabase, employee.id, row.loginEmail, `${row.firstName} ${row.lastName}`, row.loginPassword);
      if (result.error) {
        outcomes.push({ employeeCode: row.employeeCode, success: true, error: `บันทึกพนักงานสำเร็จ แต่สร้างบัญชีเข้าสู่ระบบไม่สำเร็จ: ${result.error}` });
        continue;
      }
    }

    outcomes.push({ employeeCode: row.employeeCode, success: true });
  }

  revalidatePath("/employees");
  return { outcomes };
}
