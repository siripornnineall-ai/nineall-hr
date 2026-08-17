"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Statuses where a shift-time calculation shouldn't override what actually happened
// that day (holiday/leave/absent aren't "worked late/early" in any meaningful sense).
const SPECIAL_STATUSES = new Set(["holiday", "leave", "work_from_home", "off_site", "absent"]);

function toMinuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export async function updateAttendanceTimeAction(
  recordId: string,
  workDate: string,
  values: { clockIn?: string; clockOut?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("clock_in_server_at, clock_out_server_at, status, work_shifts(start_time, end_time, grace_minutes_late, grace_minutes_early_leave, unpaid_break_minutes)")
    .eq("id", recordId)
    .eq("org_id", user.orgId)
    .single();
  if (!existing) return { error: "ไม่พบข้อมูลการลงเวลานี้" };

  if (!values.clockIn && !values.clockOut) return { error: "กรุณาระบุเวลาอย่างน้อยหนึ่งช่อง" };

  const clockInAt = values.clockIn ? new Date(`${workDate}T${values.clockIn}:00`) : existing.clock_in_server_at ? new Date(existing.clock_in_server_at) : null;
  const clockOutAt = values.clockOut ? new Date(`${workDate}T${values.clockOut}:00`) : existing.clock_out_server_at ? new Date(existing.clock_out_server_at) : null;

  const update: Record<string, string | number | null> = {};
  if (values.clockIn) update.clock_in_server_at = clockInAt!.toISOString();
  if (values.clockOut) update.clock_out_server_at = clockOutAt!.toISOString();

  // Mirror the clock-in/clock-out edge functions' late/early-leave math so a manually
  // entered time (e.g. an employee who forgot to scan) still gets the right status,
  // instead of silently keeping whatever status the record happened to have before.
  const shift = existing.work_shifts as unknown as {
    start_time: string;
    end_time: string;
    grace_minutes_late: number;
    grace_minutes_early_leave: number;
    unpaid_break_minutes: number;
  } | null;

  if (shift && clockInAt && !SPECIAL_STATUSES.has(existing.status)) {
    const [sh, sm] = shift.start_time.split(":").map(Number);
    const [eh, em] = shift.end_time.split(":").map(Number);
    const shiftStartMinute = sh * 60 + sm;
    const shiftEndMinute = eh * 60 + em;

    const lateMinutes = Math.max(0, toMinuteOfDay(clockInAt) - shiftStartMinute - shift.grace_minutes_late);
    update.late_minutes = lateMinutes;
    let status = lateMinutes > 0 ? "late" : "on_time";

    if (clockOutAt) {
      const earlyLeaveMinutes = Math.max(0, shiftEndMinute - toMinuteOfDay(clockOutAt) - shift.grace_minutes_early_leave);
      update.early_leave_minutes = earlyLeaveMinutes;
      if (earlyLeaveMinutes > 0 && status === "on_time") status = "early_leave";
      update.worked_minutes = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000) - (shift.unpaid_break_minutes ?? 0));
    }
    update.status = status;
  }

  const { error } = await supabase.from("attendance_records").update(update).eq("id", recordId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/attendance");
}
