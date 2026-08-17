"use server";

import { revalidatePath } from "next/cache";
import { employeeCreateSchema, employeeUpdateSchema } from "@nineall-hr/shared-validation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateEmployeeState {
  error?: string;
  success?: boolean;
  employeeCode?: string;
  loginEmail?: string;
  tempPassword?: string;
}

// Address sub-fields are read straight off the raw FormData rather than added to the
// zod schema: they're always-optional free text with nothing to validate, and the
// form posts them as flat `idCardHouseNo`/`currentHouseNo`/... fields keyed by prefix
// rather than a nested object (FormData has no nesting).
const ADDRESS_KEYS = ["HouseNo", "Moo", "Soi", "Yaek", "Road", "SubDistrict", "District", "Province", "PostalCode"] as const;
function buildAddress(raw: Record<string, FormDataEntryValue>, prefix: "idCard" | "current"): Record<string, string> | null {
  const address: Record<string, string> = {};
  for (const key of ADDRESS_KEYS) {
    const value = String(raw[`${prefix}${key}`] ?? "").trim();
    if (value) address[key[0].toLowerCase() + key.slice(1)] = value;
  }
  return Object.keys(address).length > 0 ? address : null;
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!1";
}

// Prorates by join month, except leave types with a min-service requirement (annual
// leave): those grant nothing until the employee reaches that tenure, then the full
// yearly entitlement (not prorated) — matches how Thai annual leave is actually meant
// to work, distinct from leave types available from day one.
async function grantLeaveBalancesForEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  employeeId: string,
  orgId: string,
  hireDate: string,
  year: number
) {
  const { data: leaveTypes } = await supabase.from("leave_types").select("id").eq("org_id", orgId).eq("is_active", true);
  if (!leaveTypes || leaveTypes.length === 0) return;

  const { data: policyRows } = await supabase
    .from("leave_policies")
    .select("leave_type_id, days_per_year, min_service_months, effective_date")
    .in(
      "leave_type_id",
      leaveTypes.map((t) => t.id)
    )
    .order("effective_date", { ascending: false });
  const latestPolicyByType = new Map<string, { days_per_year: number; min_service_months: number }>();
  for (const p of policyRows ?? []) {
    if (!latestPolicyByType.has(p.leave_type_id)) latestPolicyByType.set(p.leave_type_id, p);
  }

  const hire = new Date(hireDate);
  const hireYear = hire.getFullYear();
  const hireMonth = hire.getMonth() + 1;
  const monthsOfServiceAsOfNow =
    (new Date().getFullYear() - hireYear) * 12 + (new Date().getMonth() + 1 - hireMonth) - (new Date().getDate() < hire.getDate() ? 1 : 0);

  const rows: { employee_id: string; leave_type_id: string; year: number; entitled_days: number }[] = [];
  for (const t of leaveTypes) {
    const policy = latestPolicyByType.get(t.id);
    if (!policy) continue;
    const daysPerYear = Number(policy.days_per_year);
    const minMonths = Number(policy.min_service_months);

    if (minMonths > 0) {
      // Tenure-gated (e.g. annual leave): nothing until eligible, full entitlement once eligible.
      if (monthsOfServiceAsOfNow >= minMonths) {
        rows.push({ employee_id: employeeId, leave_type_id: t.id, year, entitled_days: daysPerYear });
      }
      continue;
    }

    // Available from day one, prorated by join month for the year they joined;
    // full entitlement for any year fully worked.
    let entitled = daysPerYear;
    if (hireYear === year) {
      const monthsRemainingInYear = 13 - hireMonth;
      entitled = Math.round(((daysPerYear * monthsRemainingInYear) / 12) * 100) / 100;
    } else if (hireYear > year) {
      continue; // not yet hired in that year
    }
    rows.push({ employee_id: employeeId, leave_type_id: t.id, year, entitled_days: entitled });
  }

  if (rows.length === 0) return;
  // Only entitled_days is set on conflict — used_days/pending_days (managed by the
  // leave request approval flow) and carried_over_days (a separate manual concern)
  // are left untouched for rows that already exist.
  await supabase.from("leave_balances").upsert(rows, { onConflict: "employee_id,leave_type_id,year" });
}

export async function syncLeaveBalancesAction(): Promise<{ error?: string; grantedCount?: number }> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, hire_date")
    .eq("org_id", user.orgId)
    .in("employment_status", ["active", "probation"]);
  if (error) return { error: error.message };

  const year = new Date().getFullYear();
  for (const emp of employees ?? []) {
    await grantLeaveBalancesForEmployee(supabase, emp.id, user.orgId, emp.hire_date, year);
  }

  revalidatePath("/employees");
  return { grantedCount: employees?.length ?? 0 };
}

export async function createEmployeeAction(
  _prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const raw = Object.fromEntries(formData.entries());
  const parsed = employeeCreateSchema.safeParse({
    ...raw,
    baseAmountBaht: Number(raw.baseAmountBaht),
    branchId: raw.branchId || undefined,
    departmentId: raw.departmentId || undefined,
    teamId: raw.teamId || undefined,
    jobPositionId: raw.jobPositionId || undefined,
    managerEmployeeId: raw.managerEmployeeId || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const input = parsed.data;
  const createLoginAccount = formData.get("createLoginAccount") === "on";
  const loginEmail = String(formData.get("loginEmail") ?? "").trim();

  if (createLoginAccount && !loginEmail) {
    return { error: "กรุณากรอกอีเมลสำหรับสร้างบัญชีผู้ใช้" };
  }

  const supabase = await createClient();

  const { data: employee, error: empError } = await supabase
    .from("employees")
    .insert({
      org_id: user.orgId,
      employee_code: input.employeeCode,
      first_name: input.firstName,
      last_name: input.lastName,
      nickname: input.nickname || null,
      phone: input.phone || null,
      personal_email: input.personalEmail || null,
      branch_id: input.branchId ?? null,
      department_id: input.departmentId ?? null,
      team_id: input.teamId ?? null,
      job_position_id: input.jobPositionId ?? null,
      manager_employee_id: input.managerEmployeeId ?? null,
      employment_type: input.employmentType,
      hire_date: input.hireDate,
      created_by: user.profileId,
    })
    .select("id, employee_code")
    .single();

  if (empError || !employee) {
    return { error: `บันทึกพนักงานไม่สำเร็จ: ${empError?.message ?? "unknown error"}` };
  }

  await supabase.from("employee_compensation").insert({
    employee_id: employee.id,
    effective_date: input.hireDate,
    employment_type: input.employmentType,
    base_amount: input.baseAmountBaht,
    created_by: user.profileId,
  });

  await grantLeaveBalancesForEmployee(supabase, employee.id, user.orgId, input.hireDate, new Date().getFullYear());

  let tempPassword: string | undefined;
  if (createLoginAccount) {
    const admin = createAdminClient();
    tempPassword = generateTempPassword();
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError || !authUser.user) {
      return { error: `สร้างบัญชีพนักงานไม่สำเร็จ: ${authError?.message ?? "unknown error"}` };
    }
    await admin.from("profiles").insert({
      id: authUser.user.id,
      org_id: user.orgId,
      employee_id: employee.id,
      role: "employee",
      full_name: `${input.firstName} ${input.lastName}`,
      email: loginEmail,
      must_change_password: true,
    });
  }

  revalidatePath("/employees");
  return {
    success: true,
    employeeCode: employee.employee_code,
    loginEmail: createLoginAccount ? loginEmail : undefined,
    tempPassword,
  };
}

export interface UpdateEmployeeState {
  error?: string;
  success?: boolean;
}

export async function updateEmployeeAction(
  employeeId: string,
  _prevState: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  const raw = Object.fromEntries(formData.entries());
  const parsed = employeeUpdateSchema.safeParse({
    ...raw,
    newBaseAmountBaht: raw.newBaseAmountBaht ? Number(raw.newBaseAmountBaht) : undefined,
    branchId: raw.branchId || undefined,
    departmentId: raw.departmentId || undefined,
    jobPositionId: raw.jobPositionId || undefined,
    managerEmployeeId: raw.managerEmployeeId || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }
  const input = parsed.data;
  const supabase = await createClient();

  // team_id is intentionally not touched here: the edit form dropped the team field
  // (per request — department + position is enough), so this update must not silently
  // wipe whatever team an employee already has assigned.
  const { error: empError } = await supabase
    .from("employees")
    .update({
      employee_code: input.employeeCode,
      first_name: input.firstName,
      last_name: input.lastName,
      nickname: input.nickname || null,
      phone: input.phone || null,
      personal_email: input.personalEmail || null,
      branch_id: input.branchId ?? null,
      department_id: input.departmentId ?? null,
      job_position_id: input.jobPositionId ?? null,
      manager_employee_id: input.managerEmployeeId ?? null,
      employment_type: input.employmentType,
      hire_date: input.hireDate,
      national_id: String(raw.nationalId ?? "").trim() || null,
      id_card_address: buildAddress(raw, "idCard"),
      current_address: buildAddress(raw, "current"),
      updated_by: user.profileId,
    })
    .eq("id", employeeId)
    .eq("org_id", user.orgId);

  if (empError) {
    return { error: `บันทึกไม่สำเร็จ: ${empError.message}` };
  }

  if (input.newBaseAmountBaht) {
    // Upsert on (employee_id, effective_date): a plain insert fails with a unique-
    // constraint violation if the salary is edited more than once on the same day
    // (e.g. HR fixes a typo right after saving) — history per prior day is untouched,
    // only today's row gets replaced.
    const { error: compError } = await supabase.from("employee_compensation").upsert(
      {
        employee_id: employeeId,
        effective_date: new Date().toISOString().slice(0, 10),
        employment_type: input.employmentType,
        base_amount: input.newBaseAmountBaht,
        created_by: user.profileId,
      },
      { onConflict: "employee_id,effective_date" }
    );
    if (compError) {
      return { error: `บันทึกข้อมูลพนักงานสำเร็จ แต่บันทึกเงินเดือนใหม่ไม่สำเร็จ: ${compError.message}` };
    }
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  return { success: true };
}

/**
 * Offboarding, not deletion. Master prompt §18/§19: business records are never hard-deleted,
 * and closing an employee's account must not remove payroll/attendance history needed for
 * accounting retention. This marks the employee resigned/terminated and deactivates their
 * login (if any) — the row, and everything referencing it (payslips, attendance, leave
 * history), stays intact.
 *
 * Calls the `offboard_employee` security-definer RPC (0018). A direct `.update()` via the
 * regular client would also work today — `restrict_employee_self_update()` (a pre-existing
 * trigger) already lets is_admin_or_hr() users update any column, and 0019 restored the plain
 * table-level GRANT after 0017's narrower one turned out to double up with that trigger and,
 * worse, block legitimate HR updates since GRANTs can't distinguish app roles that share one
 * Postgres role. The RPC is kept because it's already verified working end-to-end and gives an
 * explicit, single place enforcing "only super_admin/hr may offboard" independent of both the
 * trigger and RLS — not because either of those is insufficient on its own.
 */
export async function offboardEmployeeAction(
  employeeId: string,
  status: "resigned" | "terminated",
  effectiveDate: string,
  reason: string
) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  if (!effectiveDate) throw new Error("กรุณาระบุวันที่มีผล");

  const supabase = await createClient();
  const { error } = await supabase.rpc("offboard_employee", {
    p_employee_id: employeeId,
    p_status: status,
    p_effective_date: effectiveDate,
    p_reason: reason || null,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
}

type LeaveBalanceValues = Record<string, string | boolean>;
const lbStr = (v: LeaveBalanceValues, key: string) => (typeof v[key] === "string" ? (v[key] as string).trim() : "");
const lbNum = (v: LeaveBalanceValues, key: string, fallback = 0) => {
  if (v[key] === "" || v[key] == null) return fallback;
  const n = Number(v[key]);
  return Number.isFinite(n) ? n : fallback;
};

function monthsOfService(hireDate: string, asOf = new Date()): number {
  const hire = new Date(hireDate);
  return (asOf.getFullYear() - hire.getFullYear()) * 12 + (asOf.getMonth() - hire.getMonth()) - (asOf.getDate() < hire.getDate() ? 1 : 0);
}

// Return { error } instead of throwing: Next.js redacts thrown Server Action error
// messages in production builds (security default), so the client would only ever see a
// generic digest, never the real text — validation errors the user needs to read have to
// come back as a normal return value instead.
export async function createLeaveBalanceAction(employeeId: string, values: LeaveBalanceValues): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const leaveTypeId = lbStr(values, "leaveTypeId");
  const year = lbNum(values, "year", new Date().getFullYear());
  const entitledDays = lbNum(values, "entitledDays");
  if (!leaveTypeId) return { error: "กรุณาเลือกประเภทการลา" };

  const supabase = await createClient();

  if (entitledDays > 0) {
    const [{ data: employee }, { data: policy }] = await Promise.all([
      supabase.from("employees").select("hire_date, first_name, last_name").eq("id", employeeId).single(),
      supabase
        .from("leave_policies")
        .select("min_service_months")
        .eq("leave_type_id", leaveTypeId)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const minMonths = policy?.min_service_months ?? 0;
    if (employee && minMonths > 0) {
      const served = monthsOfService(employee.hire_date);
      if (served < minMonths) {
        return {
          error: `${employee.first_name} ${employee.last_name} ทำงานมาแล้ว ${Math.max(served, 0)} เดือน ยังไม่ครบ ${minMonths} เดือนที่ประเภทการลานี้กำหนด ยังไม่มีสิทธิ์รับวันลานี้`,
        };
      }
    }
  }

  const { error } = await supabase.from("leave_balances").upsert(
    {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      entitled_days: entitledDays,
      carried_over_days: lbNum(values, "carriedOverDays"),
    },
    { onConflict: "employee_id,leave_type_id,year" }
  );
  if (error) return { error: error.message };
  revalidatePath(`/employees/${employeeId}`);
}

export async function updateLeaveBalanceAction(id: string, values: LeaveBalanceValues): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_balances")
    .update({ entitled_days: lbNum(values, "entitledDays"), carried_over_days: lbNum(values, "carriedOverDays") })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/employees");
}

const MAX_SHIFT_ASSIGNMENT_DAYS = 366;

// shift_assignments is one row per employee per work_date (that's how the payroll/
// attendance engine looks up "what shift is this person on today"), so assigning a
// shift "going forward" means writing one row per date in the chosen range.
export async function assignShiftAction(
  employeeId: string,
  values: { shiftId?: string; workLocationId?: string; startDate?: string; endDate?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);

  if (!values.shiftId) return { error: "กรุณาเลือกกะการทำงาน" };
  if (!values.startDate || !values.endDate) return { error: "กรุณาระบุวันที่เริ่มและสิ้นสุด" };

  const start = new Date(values.startDate);
  const end = new Date(values.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { error: "ช่วงวันที่ไม่ถูกต้อง" };
  }
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (dayCount > MAX_SHIFT_ASSIGNMENT_DAYS) {
    return { error: `ช่วงวันที่ยาวเกินไป (สูงสุด ${MAX_SHIFT_ASSIGNMENT_DAYS} วัน)` };
  }

  const supabase = await createClient();
  const { data: employee } = await supabase.from("employees").select("org_id").eq("id", employeeId).single();
  if (!employee) return { error: "ไม่พบพนักงาน" };

  const rows = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    rows.push({
      org_id: employee.org_id,
      employee_id: employeeId,
      work_date: d.toISOString().slice(0, 10),
      shift_id: values.shiftId,
      work_location_id: values.workLocationId || null,
      source: "manual",
      created_by: user.profileId,
    });
  }

  const { error } = await supabase.from("shift_assignments").upsert(rows, { onConflict: "employee_id,work_date" });
  if (error) return { error: error.message };
  revalidatePath(`/employees/${employeeId}`);
}
