"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
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
