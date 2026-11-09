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

  // An auto-filled work-from-home row (no device clock-in) is not a real clock-in — replace it.
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("clock_in_server_at, clock_in_device_at, status")
    .eq("employee_id", employeeId)
    .eq("work_date", workDate)
    .maybeSingle();
  const hasRealClockIn = !!existing?.clock_in_server_at && !(existing.status === "work_from_home" && !existing.clock_in_device_at);
  if (!hasRealClockIn) {
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
      let clockIn = parseBangkokDateTime(request.original_date, times.start);
      let clockOut = parseBangkokDateTime(request.original_date, times.end);

      // The date may already hold worked time — a real clock-in, or the *other* half
      // approved earlier as a separate swap (afternoon first, morning now). Widen to cover
      // both instead of overwriting what's there with just this half.
      const { data: existing } = await supabase
        .from("attendance_records")
        .select("clock_in_server_at, clock_out_server_at")
        .eq("employee_id", request.employee_id)
        .eq("work_date", request.original_date)
        .maybeSingle();
      if (existing?.clock_in_server_at) {
        const existingIn = new Date(existing.clock_in_server_at);
        if (existingIn < clockIn) clockIn = existingIn;
      }
      if (existing?.clock_out_server_at) {
        const existingOut = new Date(existing.clock_out_server_at);
        if (existingOut > clockOut) clockOut = existingOut;
      }
      // If the merged span crosses the 12:00-13:00 lunch break, don't count that hour.
      const lunchStart = parseBangkokDateTime(request.original_date, HALF_DAY_TIMES.morning.end);
      const lunchEnd = parseBangkokDateTime(request.original_date, HALF_DAY_TIMES.afternoon.start);
      const spansLunch = clockIn <= lunchStart && clockOut >= lunchEnd;
      const workedMinutes = Math.round((clockOut.getTime() - clockIn.getTime()) / 60000) - (spansLunch ? 60 : 0);
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
          worked_minutes: workedMinutes,
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

// Removes a day-off swap request outright (entered by mistake, wrong date, ...). For an approved one the database
// function also puts back the schedule rows and day-off placeholders the swap created — see migration 0139.
export async function deleteDayOffSwapRequestAction(requestId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_day_off_swap_request", { p_request_id: requestId });
  if (error) return { error: error.message };

  revalidatePath("/day-off-swap");
  revalidatePath("/attendance");
}

export interface SwapEditInput {
  firstDate: string; // original day off that is worked instead ("" = no original date: a plain day-off request)
  substituteDate: string;
  unit: "full_day" | "half_day";
  period: "morning" | "afternoon" | null;
  reason: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// HR edit of a day-off swap request. A pending or rejected request is just updated. An approved one has already
// changed the schedule, so the database first puts that back and reopens the request (reopen_day_off_swap_request,
// migration 0139); then the fields are updated and the request is approved again, which applies the new dates through
// the normal approval code above.
export async function updateDayOffSwapRequestAction(requestId: string, input: SwapEditInput): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("day_off_swap_requests")
    .select("id, employee_id, status")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!current) return { error: "ไม่พบคำขอนี้" };

  const originalDate = input.firstDate || null;
  if ((originalDate && !ISO_DATE.test(originalDate)) || !ISO_DATE.test(input.substituteDate)) return { error: "กรุณาเลือกวันที่ให้ครบ" };
  if (originalDate && originalDate === input.substituteDate) return { error: "วันหยุดเดิมและวันหยุดใหม่ต้องไม่ใช่วันเดียวกัน" };
  const unit = originalDate ? input.unit : "full_day";
  if (unit === "half_day" && input.period !== "morning" && input.period !== "afternoon") return { error: "กรุณาเลือกช่วงครึ่งวัน (เช้า/บ่าย)" };
  const period = unit === "half_day" ? input.period : null;

  const { data: holiday } = await supabase
    .from("company_holidays")
    .select("holiday_date")
    .eq("org_id", user.orgId)
    .eq("holiday_date", input.substituteDate)
    .maybeSingle();
  if (holiday) return { error: "วันที่เลือกเป็นวันหยุดนักขัตฤกษ์ กรุณาเลือกวันอื่น หรือใช้หน้าสลับวันหยุดนักขัตฤกษ์แทน" };

  // A half-day request only occupies its own half on both dates; a full-day one occupies both halves.
  const { data: others } = await supabase
    .from("day_off_swap_requests")
    .select("original_date, substitute_date, unit, period")
    .eq("employee_id", current.employee_id)
    .neq("id", requestId)
    .in("status", ["pending", "approved"]);
  const periodsOverlap = (a: string | null, b: string | null) => a === null || b === null || a === b;
  const dates = [originalDate, input.substituteDate].filter((d): d is string => !!d);
  const clash = (others ?? []).some(
    (o) =>
      dates.some((d) => o.original_date === d || o.substitute_date === d) && periodsOverlap(o.unit === "half_day" ? o.period : null, period)
  );
  if (clash) return { error: "วันที่เลือกมีคำขอสลับวันหยุดอื่นของพนักงานคนนี้อยู่แล้ว กรุณาเลือกวันอื่น" };

  const wasApproved = current.status === "approved";
  if (wasApproved) {
    const { error: reopenError } = await supabase.rpc("reopen_day_off_swap_request", { p_request_id: requestId });
    if (reopenError) return { error: reopenError.message };
  }

  const { error: updateError } = await supabase
    .from("day_off_swap_requests")
    .update({
      original_date: originalDate,
      substitute_date: input.substituteDate,
      unit,
      period,
      reason: input.reason.trim() || null,
    })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (updateError) {
    return { error: wasApproved ? `${updateError.message} (คำขอถูกเปลี่ยนเป็นรออนุมัติ กรุณาอนุมัติใหม่)` : updateError.message };
  }

  if (wasApproved) {
    try {
      await decideDayOffSwapRequest(requestId, "approved");
    } catch (e) {
      return { error: `บันทึกการแก้ไขแล้ว แต่อนุมัติใหม่ไม่สำเร็จ (คำขอเป็นรออนุมัติ กรุณากดอนุมัติ): ${e instanceof Error ? e.message : ""}` };
    }
  }

  revalidatePath("/day-off-swap");
  revalidatePath("/attendance");
}
