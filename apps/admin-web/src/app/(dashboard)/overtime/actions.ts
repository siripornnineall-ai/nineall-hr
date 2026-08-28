"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function deleteOvertimeRequestAction(requestId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.from("overtime_requests").delete().eq("id", requestId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  await supabase.from("approval_steps").delete().eq("request_type", "overtime").eq("request_id", requestId);

  revalidatePath("/overtime");
}

export async function decideOvertimeRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: request } = await supabase.from("overtime_requests").select("requested_hours").eq("id", requestId).single();

  const { error } = await supabase
    .from("overtime_requests")
    .update({
      status: decision,
      approved_hours: decision === "approved" ? request?.requested_hours : null,
    })
    .eq("id", requestId)
    .eq("org_id", user.orgId);

  if (error) throw new Error(error.message);

  await supabase
    .from("approval_steps")
    .update({ status: decision, acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "overtime")
    .eq("request_id", requestId)
    .eq("status", "pending");

  revalidatePath("/overtime");
}

function computeHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const hours = eh + em / 60 - (sh + sm / 60);
  return hours > 0 ? Math.round(hours * 100) / 100 : 0;
}

// Lets HR record OT the employee never submitted a request for (e.g. they simply forgot).
// Inserted as pending then immediately approved — mirrors createBackdatedLeaveAction's
// pattern — rather than inserting straight as 'approved', since a plain insert bypasses
// the create_first_approval_step trigger's approval_steps row entirely otherwise, leaving
// it stuck as if still awaiting the first (never-created) approval step.
// overtime_requests_insert_admin_hr (migration 0056) caps work_date at 3 days back, same
// as the employee-facing cap from migration 0049.
export async function createBackdatedOvertimeAction(values: {
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  rateMultiplier: string;
  taskDescription?: string;
  reason?: string;
}): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  if (!values.employeeId) return { error: "กรุณาเลือกพนักงาน" };
  if (!values.workDate) return { error: "กรุณาระบุวันที่" };
  const hours = computeHours(values.startTime, values.endTime);
  if (hours <= 0) return { error: "กรุณาระบุเวลาให้ถูกต้อง" };
  const rateMultiplier = Number(values.rateMultiplier);
  if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) return { error: "อัตรา OT ไม่ถูกต้อง" };

  const { data: employee } = await supabase.from("employees").select("org_id").eq("id", values.employeeId).eq("org_id", user.orgId).single();
  if (!employee) return { error: "ไม่พบพนักงาน" };

  const { data: request, error: insertError } = await supabase
    .from("overtime_requests")
    .insert({
      org_id: employee.org_id,
      employee_id: values.employeeId,
      work_date: values.workDate,
      start_time: values.startTime,
      end_time: values.endTime,
      requested_hours: hours,
      rate_multiplier: rateMultiplier,
      task_description: values.taskDescription || null,
      reason: values.reason || "บันทึกย้อนหลังโดยแอดมิน",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError || !request) return { error: insertError?.message ?? "บันทึก OT ไม่สำเร็จ" };

  const { error: approveError } = await supabase.from("overtime_requests").update({ status: "approved", approved_hours: hours }).eq("id", request.id);
  if (approveError) return { error: approveError.message };

  await supabase
    .from("approval_steps")
    .update({ status: "approved", comment: "อนุมัติอัตโนมัติ (บันทึกย้อนหลังโดยแอดมิน)", acted_at: new Date().toISOString(), approver_employee_id: user.employeeId })
    .eq("request_type", "overtime")
    .eq("request_id", request.id)
    .eq("status", "pending");

  revalidatePath("/overtime");
}

export async function updateOvertimeRequestAction(
  requestId: string,
  values: { workDate: string; startTime: string; endTime: string; rateMultiplier: string; taskDescription?: string; reason?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const supabase = await createClient();

  const hours = computeHours(values.startTime, values.endTime);
  if (!values.workDate || hours <= 0) return { error: "กรุณาระบุวันที่และเวลาให้ถูกต้อง" };
  const rateMultiplier = Number(values.rateMultiplier);
  if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) return { error: "อัตรา OT ไม่ถูกต้อง" };

  const { data: existing } = await supabase.from("overtime_requests").select("status").eq("id", requestId).eq("org_id", user.orgId).single();
  if (!existing) return { error: "ไม่พบคำขอ OT นี้" };

  const { error } = await supabase
    .from("overtime_requests")
    .update({
      work_date: values.workDate,
      start_time: values.startTime,
      end_time: values.endTime,
      requested_hours: hours,
      approved_hours: existing.status === "approved" ? hours : undefined,
      rate_multiplier: rateMultiplier,
      task_description: values.taskDescription || null,
      reason: values.reason || null,
    })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/overtime");
}
