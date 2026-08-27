"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBangkokDateTime } from "@/lib/bangkokTime";

// WFH/off-site "leave" isn't a real absence — the employee is still working, just not
// clocking in normally, so attendance/payroll still needs a row with real clock times for
// that day. Any other approved leave type is a genuine absence, so the Attendance page
// should show it as "ลา" instead of the day just being blank (indistinguishable from an
// employee who simply never showed up). Either way, HR previously had to fill this in by
// hand via the backdated-attendance form after every approval — this does it automatically.
const OFFSITE_LEAVE_STATUS: Record<string, "work_from_home" | "off_site"> = { WFH: "work_from_home", OFFSITE: "off_site" };

async function autoFillLeaveAttendance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  employeeId: string,
  leaveTypeId: string,
  startDate: string,
  endDate: string,
  unit: string
) {
  const { data: leaveType } = await supabase.from("leave_types").select("code").eq("id", leaveTypeId).single();
  if (!leaveType) return;
  const offsiteStatus = OFFSITE_LEAVE_STATUS[leaveType.code];
  // A half-day/hourly absence still has the employee clocking in for the rest of the day —
  // only a full-day absence is safe to blanket-mark "ลา" without risking a real clock-in.
  if (!offsiteStatus && unit !== "full_day") return;

  const workDates: string[] = [];
  for (let d = new Date(`${startDate}T00:00:00Z`); d <= new Date(`${endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    workDates.push(d.toISOString().slice(0, 10));
  }

  for (const workDate of workDates) {
    if (offsiteStatus) {
      const { data: assignment } = await supabase
        .from("shift_assignments")
        .select("shift_id, work_location_id")
        .eq("employee_id", employeeId)
        .eq("work_date", workDate)
        .maybeSingle();
      if (!assignment?.shift_id) continue; // no shift on file for this date — nothing to derive times from

      const { data: shift } = await supabase.from("work_shifts").select("start_time, end_time").eq("id", assignment.shift_id).single();
      if (!shift) continue;

      const clockIn = parseBangkokDateTime(workDate, shift.start_time.slice(0, 5));
      const clockOut = parseBangkokDateTime(workDate, shift.end_time.slice(0, 5));

      await supabase.from("attendance_records").upsert(
        {
          org_id: orgId,
          employee_id: employeeId,
          work_date: workDate,
          shift_id: assignment.shift_id,
          work_location_id: assignment.work_location_id ?? null,
          clock_in_server_at: clockIn.toISOString(),
          clock_out_server_at: clockOut.toISOString(),
          status: offsiteStatus,
          late_minutes: 0,
          early_leave_minutes: 0,
          worked_minutes: Math.round((clockOut.getTime() - clockIn.getTime()) / 60000),
          needs_review: false,
        },
        { onConflict: "employee_id,work_date" }
      );
    } else {
      // A genuine absence — no clock times to fill in, just mark the day as "ลา" so it's
      // distinguishable from a day the employee simply never clocked in at all.
      await supabase.from("attendance_records").upsert(
        {
          org_id: orgId,
          employee_id: employeeId,
          work_date: workDate,
          shift_id: null,
          work_location_id: null,
          clock_in_server_at: null,
          clock_out_server_at: null,
          status: "leave",
          late_minutes: 0,
          early_leave_minutes: 0,
          worked_minutes: 0,
          needs_review: false,
        },
        { onConflict: "employee_id,work_date" }
      );
    }
  }
  revalidatePath(`/attendance/${employeeId}`);
  revalidatePath("/attendance");
}

export async function decideLeaveRequest(requestId: string, decision: "approved" | "rejected", comment?: string) {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("employee_id, leave_type_id, start_date, end_date, unit")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .single();

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

  if (decision === "approved" && request) {
    await autoFillLeaveAttendance(supabase, user.orgId, request.employee_id, request.leave_type_id, request.start_date, request.end_date, request.unit);
  }

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

  const requestEndDate = unit === "full_day" ? values.endDate : values.startDate;
  await autoFillLeaveAttendance(supabase, employee.org_id, values.employeeId, values.leaveTypeId, values.startDate, requestEndDate, unit);

  revalidatePath("/leave");
}
