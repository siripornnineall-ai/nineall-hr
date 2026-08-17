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

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export async function updateAttendanceTimeAction(
  recordId: string,
  workDate: string,
  values: { clockIn?: string; clockOut?: string; shiftId?: string; workLocationId?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("clock_in_server_at, clock_out_server_at, status, shift_id, work_location_id, clock_in_latitude, clock_in_longitude")
    .eq("id", recordId)
    .eq("org_id", user.orgId)
    .single();
  if (!existing) return { error: "ไม่พบข้อมูลการลงเวลานี้" };

  if (!values.clockIn && !values.clockOut && !values.shiftId && !values.workLocationId) {
    return { error: "กรุณาระบุข้อมูลอย่างน้อยหนึ่งช่อง" };
  }

  const clockInAt = values.clockIn ? new Date(`${workDate}T${values.clockIn}:00`) : existing.clock_in_server_at ? new Date(existing.clock_in_server_at) : null;
  const clockOutAt = values.clockOut ? new Date(`${workDate}T${values.clockOut}:00`) : existing.clock_out_server_at ? new Date(existing.clock_out_server_at) : null;

  const update: Record<string, string | number | boolean | null> = {};
  if (values.clockIn) update.clock_in_server_at = clockInAt!.toISOString();
  if (values.clockOut) update.clock_out_server_at = clockOutAt!.toISOString();
  if (values.shiftId) update.shift_id = values.shiftId;
  if (values.workLocationId) update.work_location_id = values.workLocationId;

  // Mirror the clock-in/clock-out edge functions' late/OT/early-leave math so a manually
  // entered time — or a shift assigned after the fact (e.g. the employee clocked in
  // before any shift_assignments row existed for that day, so shift_id came back null) —
  // still gets the right status instead of silently staying blank.
  const shiftId = values.shiftId || existing.shift_id;
  const { data: shift } = shiftId
    ? await supabase
        .from("work_shifts")
        .select("start_time, end_time, grace_minutes_late, grace_minutes_early_leave, unpaid_break_minutes, ot_after_shift_allowed")
        .eq("id", shiftId)
        .single()
    : { data: null };

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
      update.ot_minutes = shift.ot_after_shift_allowed ? Math.max(0, toMinuteOfDay(clockOutAt) - shiftEndMinute) : 0;
    }
    update.status = status;
  }

  // Only recomputable if the record actually has GPS coordinates on file (real clock-ins
  // do; a manually-created record with no scan never will) — nothing to check otherwise.
  const workLocationId = values.workLocationId || existing.work_location_id;
  if (workLocationId && existing.clock_in_latitude != null && existing.clock_in_longitude != null) {
    const { data: location } = await supabase.from("work_locations").select("latitude, longitude, radius_meters").eq("id", workLocationId).single();
    if (location) {
      const distanceM = haversineMeters(existing.clock_in_latitude, existing.clock_in_longitude, location.latitude, location.longitude);
      update.clock_in_distance_m = distanceM;
      update.clock_in_within_geofence = distanceM <= location.radius_meters;
    }
  }

  const { error } = await supabase.from("attendance_records").update(update).eq("id", recordId).eq("org_id", user.orgId);
  if (error) return { error: error.message };

  revalidatePath("/attendance");
}
