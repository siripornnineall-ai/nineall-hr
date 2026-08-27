"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBangkokDateTime } from "@/lib/bangkokTime";

// Statuses where a shift-time calculation shouldn't override what actually happened
// that day (holiday/leave/absent aren't "worked late/early" in any meaningful sense).
const SPECIAL_STATUSES = new Set(["holiday", "leave", "work_from_home", "off_site", "absent"]);

// Rounds to the nearest minute (not floor) so a manually-entered time that carries real
// seconds (e.g. falling back to an existing clock_in_server_at) resolves a late/grace
// boundary the same way clock_in()/clock_out() do — see migration 0048.
//
// Reads Bangkok-local time explicitly rather than d.getHours()/getMinutes() (server-local,
// i.e. UTC on Vercel) — shift start/end times are Bangkok wall-clock, so comparing against
// the server's own UTC clock would silently be off by 7 hours.
function toMinuteOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return Math.round((get("hour") * 3600 + get("minute") * 60 + get("second")) / 60);
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

  const clockInAt = values.clockIn ? parseBangkokDateTime(workDate, values.clockIn) : existing.clock_in_server_at ? new Date(existing.clock_in_server_at) : null;
  const clockOutAt = values.clockOut ? parseBangkokDateTime(workDate, values.clockOut) : existing.clock_out_server_at ? new Date(existing.clock_out_server_at) : null;

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

// Empty string means "compute on_time/late/early_leave from the entered times" (see below) —
// the rest are day types with no clock time to derive a status from.
const SPECIAL_STATUS_OPTIONS = new Set(["", "absent", "holiday", "leave", "work_from_home", "off_site"]);

// Lets HR fill in a day that has no attendance_records row at all (the employee simply
// never clocked in) — updateAttendanceTimeAction above only edits an existing row.
// Upserts on (employee_id, work_date) so re-submitting the same date corrects it
// instead of erroring.
export async function createBackdatedAttendanceAction(
  employeeId: string,
  values: { workDate: string; clockIn?: string; clockOut?: string; status: string; shiftId?: string; workLocationId?: string }
): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  if (!values.workDate) return { error: "กรุณาระบุวันที่" };
  if (!SPECIAL_STATUS_OPTIONS.has(values.status)) return { error: "กรุณาเลือกสถานะ" };

  const { data: employee } = await supabase.from("employees").select("org_id").eq("id", employeeId).eq("org_id", user.orgId).single();
  if (!employee) return { error: "ไม่พบพนักงาน" };

  const clockInAt = values.clockIn ? parseBangkokDateTime(values.workDate, values.clockIn) : null;
  const clockOutAt = values.clockOut ? parseBangkokDateTime(values.workDate, values.clockOut) : null;

  let status = values.status;
  let lateMinutes = 0;
  let earlyLeaveMinutes = 0;
  let workedMinutes = 0;

  if (status === "") {
    if (!clockInAt) return { error: "กรุณาระบุเวลาเข้างาน เพื่อให้ระบบคำนวณสถานะให้อัตโนมัติ" };
    status = "on_time";
    if (values.shiftId) {
      const { data: shift } = await supabase
        .from("work_shifts")
        .select("start_time, end_time, grace_minutes_late, grace_minutes_early_leave, unpaid_break_minutes")
        .eq("id", values.shiftId)
        .single();
      if (shift) {
        const [sh, sm] = shift.start_time.split(":").map(Number);
        const [eh, em] = shift.end_time.split(":").map(Number);
        lateMinutes = Math.max(0, toMinuteOfDay(clockInAt) - (sh * 60 + sm) - shift.grace_minutes_late);
        status = lateMinutes > 0 ? "late" : "on_time";
        if (clockOutAt) {
          earlyLeaveMinutes = Math.max(0, eh * 60 + em - toMinuteOfDay(clockOutAt) - shift.grace_minutes_early_leave);
          if (earlyLeaveMinutes > 0 && status === "on_time") status = "early_leave";
          workedMinutes = Math.max(0, Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000) - (shift.unpaid_break_minutes ?? 0));
        }
      }
    }
  }

  const { error } = await supabase.from("attendance_records").upsert(
    {
      org_id: employee.org_id,
      employee_id: employeeId,
      work_date: values.workDate,
      shift_id: values.shiftId || null,
      work_location_id: values.workLocationId || null,
      clock_in_server_at: clockInAt ? clockInAt.toISOString() : null,
      clock_out_server_at: clockOutAt ? clockOutAt.toISOString() : null,
      status,
      late_minutes: lateMinutes,
      early_leave_minutes: earlyLeaveMinutes,
      worked_minutes: workedMinutes,
      needs_review: false,
    },
    { onConflict: "employee_id,work_date" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/attendance/${employeeId}`);
  revalidatePath("/attendance");
}
