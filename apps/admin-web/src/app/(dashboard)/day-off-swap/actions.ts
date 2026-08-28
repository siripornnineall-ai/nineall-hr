"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBangkokDateTime } from "@/lib/bangkokTime";

// Matches the half-day convention already used for leave and holiday-swap: morning =
// 08:00-12:00, afternoon = 13:00-17:00.
const HALF_DAY_TIMES: Record<string, { start: string; end: string }> = {
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "13:00", end: "17:00" },
};

// Marks workDate as a day off for employeeId — both in shift_assignments (so future syncs
// and the day-off-swap picker see it) and directly in attendance_records (so it shows up
// immediately everywhere instead of waiting on the lazy syncDayOffAttendance), unless the
// date already has a real clock-in on file.
async function grantDayOff(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, employeeId: string, workDate: string) {
  await supabase.from("shift_assignments").upsert(
    { org_id: orgId, employee_id: employeeId, work_date: workDate, shift_id: null, work_location_id: null, is_day_off: true, source: "day_off_swap" },
    { onConflict: "employee_id,work_date" }
  );

  const { data: existing } = await supabase.from("attendance_records").select("clock_in_server_at").eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle();
  if (!existing?.clock_in_server_at) {
    await supabase.from("attendance_records").upsert(
      {
        org_id: orgId,
        employee_id: employeeId,
        work_date: workDate,
        status: "day_off",
        late_minutes: 0,
        early_leave_minutes: 0,
        worked_minutes: 0,
        needs_review: false,
      },
      { onConflict: "employee_id,work_date" }
    );
  }
}

export async function decideDayOffSwapRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("day_off_swap_requests")
    .select("org_id, employee_id, original_date, substitute_date, unit, period")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .single();
  if (!request) throw new Error("ไม่พบคำขอนี้");

  const { error } = await supabase
    .from("day_off_swap_requests")
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: user.employeeId })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);

  if (decision === "approved") {
    // The employee's normal shift — most recent shift_assignment row that actually has one —
    // is what they'll work on the original day-off date instead of having it off.
    const { data: defaultAssignment } = await supabase
      .from("shift_assignments")
      .select("shift_id, work_location_id")
      .eq("employee_id", request.employee_id)
      .not("shift_id", "is", null)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // No original_date at all: this employee has no regular day off to trade away in the
    // first place (works every day per their schedule) — she confirmed no make-up day is
    // required, so it's a plain grant of the substitute_date as a day off, nothing else
    // to flip back to working.
    if (!request.original_date) {
      await grantDayOff(supabase, request.org_id, request.employee_id, request.substitute_date);
      revalidatePath("/day-off-swap");
      revalidatePath("/attendance");
      return;
    }

    // For a retroactive swap (original_date already in the past), syncDayOffAttendance may
    // have already auto-filled a "day_off" placeholder for that date before the employee
    // asked for the swap — clear it so their real clock-in (if any) shows through instead,
    // same as the holiday-swap flow does for a stale "holiday" marker.
    await supabase
      .from("attendance_records")
      .delete()
      .eq("employee_id", request.employee_id)
      .eq("work_date", request.original_date)
      .eq("status", "day_off");

    if (request.unit === "half_day" && request.period) {
      // Only the worked half of the original day off is automated — there's no
      // half-day-off flag on shift_assignments (same limitation as half-day leave), so the
      // substitute date is deliberately left untouched; the employee's real clock-in on
      // that date naturally reflects the shorter day HR agreed to.
      const times = HALF_DAY_TIMES[request.period];
      const clockIn = parseBangkokDateTime(request.original_date, times.start);
      const clockOut = parseBangkokDateTime(request.original_date, times.end);
      await supabase.from("attendance_records").upsert(
        {
          org_id: request.org_id,
          employee_id: request.employee_id,
          work_date: request.original_date,
          shift_id: defaultAssignment?.shift_id ?? null,
          work_location_id: defaultAssignment?.work_location_id ?? null,
          clock_in_server_at: clockIn.toISOString(),
          clock_out_server_at: clockOut.toISOString(),
          status: "on_time",
          late_minutes: 0,
          early_leave_minutes: 0,
          worked_minutes: Math.round((clockOut.getTime() - clockIn.getTime()) / 60000),
          needs_review: false,
        },
        { onConflict: "employee_id,work_date" }
      );
    } else {
      await supabase.from("shift_assignments").upsert(
        {
          org_id: request.org_id,
          employee_id: request.employee_id,
          work_date: request.original_date,
          shift_id: defaultAssignment?.shift_id ?? null,
          work_location_id: defaultAssignment?.work_location_id ?? null,
          is_day_off: false,
          source: "day_off_swap",
        },
        { onConflict: "employee_id,work_date" }
      );

      await grantDayOff(supabase, request.org_id, request.employee_id, request.substitute_date);
    }
  }

  revalidatePath("/day-off-swap");
  revalidatePath("/attendance");
}
