"use server";

import { revalidatePath } from "next/cache";
import { employeeCreateSchema } from "@nineall-hr/shared-validation";
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

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + "!1";
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
