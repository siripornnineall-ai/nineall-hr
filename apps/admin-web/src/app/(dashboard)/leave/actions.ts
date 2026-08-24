"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function decideLeaveRequest(requestId: string, decision: "approved" | "rejected", comment?: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision })
    .eq("id", requestId)
    .eq("org_id", user.orgId);

  if (error) throw new Error(error.message);

  await supabase
    .from("approval_steps")
    .update({ status: decision, comment, acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "leave")
    .eq("request_id", requestId)
    .eq("status", "pending");

  revalidatePath("/leave");
}

export async function updateLeaveRequestAction(
  requestId: string,
  values: { leaveTypeId: string; startDate: string; endDate: string; totalDays: string; reason?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const supabase = await createClient();

  if (!values.leaveTypeId || !values.startDate || !values.endDate) return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" };
  if (values.endDate < values.startDate) return { error: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา" };
  const totalDays = Number(values.totalDays);
  if (!Number.isFinite(totalDays) || totalDays <= 0) return { error: "จำนวนวันลาไม่ถูกต้อง" };

  const { error } = await supabase
    .from("leave_requests")
    .update({
      leave_type_id: values.leaveTypeId,
      start_date: values.startDate,
      end_date: values.endDate,
      total_days: totalDays,
      reason: values.reason || null,
    })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/leave");
}

// Lets HR record a leave that's already happened (e.g. a paper form filed late, or an
// emergency absence sorted out after the fact) directly as an approved request, on
// behalf of an employee who never submitted one themselves. Inserted as "pending" first
// and then immediately flipped to "approved" — two steps, not one status straight to
// "approved" on insert — because validate_and_reserve_leave_balance() (a BEFORE INSERT
// trigger) only reserves pending_days, and apply_leave_decision() (an AFTER UPDATE OF
// status trigger) is what actually moves pending_days into used_days; skipping the
// pending step would leave the balance under-counted.
export async function createBackdatedLeaveAction(values: {
  employeeId: string;
  leaveTypeId: string;
  unit?: "full_day" | "half_day" | "hourly";
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  totalDays: string;
  reason?: string;
}): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const unit = values.unit ?? "full_day";
  if (!values.employeeId) return { error: "กรุณาเลือกพนักงาน" };
  if (!values.leaveTypeId || !values.startDate) return { error: "กรุณากรอกข้อมูลให้ครบถ้วน" };
  if (unit === "full_day" && (!values.endDate || values.endDate < values.startDate)) {
    return { error: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มลา" };
  }
  const totalDays = Number(values.totalDays);
  if (!Number.isFinite(totalDays) || totalDays <= 0) return { error: "จำนวนวันลาไม่ถูกต้อง" };

  const { data: employee } = await supabase.from("employees").select("org_id").eq("id", values.employeeId).eq("org_id", user.orgId).single();
  if (!employee) return { error: "ไม่พบพนักงาน" };

  const { data: request, error: insertError } = await supabase
    .from("leave_requests")
    .insert({
      org_id: employee.org_id,
      employee_id: values.employeeId,
      leave_type_id: values.leaveTypeId,
      start_date: values.startDate,
      end_date: unit === "full_day" ? values.endDate : values.startDate,
      start_time: unit === "full_day" ? null : (values.startTime ?? null),
      end_time: unit === "full_day" ? null : (values.endTime ?? null),
      total_days: totalDays,
      unit,
      reason: values.reason || "บันทึกย้อนหลังโดยแอดมิน",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !request) return { error: insertError?.message ?? "บันทึกคำขอลาไม่สำเร็จ" };

  const { error: approveError } = await supabase.from("leave_requests").update({ status: "approved" }).eq("id", request.id);
  if (approveError) return { error: approveError.message };

  await supabase
    .from("approval_steps")
    .update({ status: "approved", comment: "อนุมัติอัตโนมัติ (บันทึกย้อนหลังโดยแอดมิน)", acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "leave")
    .eq("request_id", request.id)
    .eq("status", "pending");

  revalidatePath("/leave");
}
