"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBangkokDateTime } from "@/lib/bangkokTime";

// Matches the half-day convention already used for leave (AddBackdatedLeaveForm / the
// employee leave form): morning = 08:00-12:00, afternoon = 13:00-17:00.
const HALF_DAY_TIMES: Record<string, { start: string; end: string }> = {
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "13:00", end: "17:00" },
};

export async function decideHolidaySwapRequest(requestId: string, decision: "approved" | "rejected") {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: request } = await supabase
    .from("holiday_swap_requests")
    .select("org_id, employee_id, holiday_date, substitute_date, unit, period")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .single();
  if (!request) throw new Error("ไม่พบคำขอนี้");

  const { error } = await supabase
    .from("holiday_swap_requests")
    .update({ status: decision, decided_at: new Date().toISOString(), decided_by: user.employeeId })
    .eq("id", requestId)
    .eq("org_id", user.orgId);
  if (error) throw new Error(error.message);

  if (decision === "approved") {
    // The employee's normal shift — most recent shift_assignment row that actually has one —
    // is what they'll work on the holiday date instead of having it off.
    const { data: defaultAssignment } = await supabase
      .from("shift_assignments")
      .select("shift_id, work_location_id")
      .eq("employee_id", request.employee_id)
      .not("shift_id", "is", null)
      .order("work_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    await supabase.from("shift_assignments").upsert(
      {
        org_id: request.org_id,
        employee_id: request.employee_id,
        work_date: request.holiday_date,
        shift_id: defaultAssignment?.shift_id ?? null,
        work_location_id: defaultAssignment?.work_location_id ?? null,
        is_day_off: false,
        source: "holiday_swap",
      },
      { onConflict: "employee_id,work_date" }
    );

    // Clear a stale auto-filled "holiday" marker (see syncHolidayAttendance) for the date
    // they're now actually working — their real clock-in takes over from here.
    await supabase
      .from("attendance_records")
      .delete()
      .eq("employee_id", request.employee_id)
      .eq("work_date", request.holiday_date)
      .eq("status", "holiday");

    if (request.unit === "half_day" && request.period) {
      // Only the holiday side is automated for a half-day swap: the worked half is what
      // matters for pay, so it's pre-filled here. The substitute date isn't touched —
      // there's no half-day-off flag on the schedule (same as ordinary half-day leave,
      // which also doesn't touch shift_assignments), so the employee's real clock-in on
      // that date naturally reflects the shorter day HR agreed to.
      const times = HALF_DAY_TIMES[request.period];
      const clockIn = parseBangkokDateTime(request.holiday_date, times.start);
      const clockOut = parseBangkokDateTime(request.holiday_date, times.end);
      await supabase.from("attendance_records").upsert(
        {
          org_id: request.org_id,
          employee_id: request.employee_id,
          work_date: request.holiday_date,
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
      // Full-day swap: the substitute date becomes a real day off.
      await supabase.from("shift_assignments").upsert(
        {
          org_id: request.org_id,
          employee_id: request.employee_id,
          work_date: request.substitute_date,
          shift_id: null,
          work_location_id: null,
          is_day_off: true,
          source: "holiday_swap",
        },
        { onConflict: "employee_id,work_date" }
      );

      // Writing shift_assignments alone left the Attendance page showing this date as
      // blank until someone happened to view that exact date (syncDayOffAttendance only
      // runs then) — the per-employee monthly page never runs it at all. Leave approval
      // writes attendance_records directly at decision time; do the same here instead of
      // relying on that lazy sync.
      // An auto-filled work-from-home row (employees.auto_wfh_no_clockin writes one at
      // 00:05 with no device clock-in) is not a real clock-in: the swap turns that day into a
      // day off, so it has to be replaced, not kept (reported 2026-10-12, นวพร).
      const { data: existingSubstitute } = await supabase
        .from("attendance_records")
        .select("clock_in_server_at, clock_in_device_at, status")
        .eq("employee_id", request.employee_id)
        .eq("work_date", request.substitute_date)
        .maybeSingle();
      const hasRealClockIn =
        !!existingSubstitute?.clock_in_server_at && !(existingSubstitute.status === "work_from_home" && !existingSubstitute.clock_in_device_at);
      if (!hasRealClockIn) {
        await supabase.from("attendance_records").upsert(
          {
            org_id: request.org_id,
            employee_id: request.employee_id,
            work_date: request.substitute_date,
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
  }

  revalidatePath("/holiday-swap");
  revalidatePath("/attendance");
}

// Removes a swap request outright (entered by mistake, wrong date, ...). For an approved one
// the database function also puts back the schedule rows and day-off placeholders the swap
// created — see migration 0104.
export async function deleteHolidaySwapRequestAction(requestId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_holiday_swap_request", { p_request_id: requestId });
  if (error) return { error: error.message };

  revalidatePath("/holiday-swap");
  revalidatePath("/attendance");
}

export interface SwapEditInput {
  firstDate: string;
  substituteDate: string;
  unit: "full_day" | "half_day";
  period: "morning" | "afternoon" | null;
  reason: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// HR edit of a holiday-swap request (wrong date, full/half day, reason ...). A pending or rejected request is just
// updated. An approved one has already changed the schedule, so the database first puts that back and reopens the
// request (reopen_holiday_swap_request, migration 0139); then the fields are updated and the request is approved again,
// which applies the new dates through the normal approval code above.
export async function updateHolidaySwapRequestAction(requestId: string, input: SwapEditInput): Promise<{ error?: string } | void> {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("holiday_swap_requests")
    .select("id, employee_id, status")
    .eq("id", requestId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!current) return { error: "ไม่พบคำขอนี้" };

  if (!ISO_DATE.test(input.firstDate) || !ISO_DATE.test(input.substituteDate)) return { error: "กรุณาเลือกวันที่ให้ครบ" };
  if (input.firstDate === input.substituteDate) return { error: "วันหยุดนักขัตฤกษ์และวันหยุดชดเชยต้องไม่ใช่วันเดียวกัน" };
  if (input.unit === "half_day" && input.period !== "morning" && input.period !== "afternoon") return { error: "กรุณาเลือกช่วงครึ่งวัน (เช้า/บ่าย)" };
  const period = input.unit === "half_day" ? input.period : null;

  const { data: holiday } = await supabase
    .from("company_holidays")
    .select("holiday_date")
    .eq("org_id", user.orgId)
    .eq("holiday_date", input.firstDate)
    .maybeSingle();
  if (!holiday) return { error: "วันที่เลือกไม่ใช่วันหยุดนักขัตฤกษ์ของบริษัท" };

  // A half-day request only occupies its own half on both dates; a full-day one occupies both halves.
  const { data: others } = await supabase
    .from("holiday_swap_requests")
    .select("holiday_date, substitute_date, unit, period")
    .eq("employee_id", current.employee_id)
    .neq("id", requestId)
    .in("status", ["pending", "approved"]);
  const periodsOverlap = (a: string | null, b: string | null) => a === null || b === null || a === b;
  const clash = (others ?? []).some(
    (o) =>
      [input.firstDate, input.substituteDate].some((d) => o.holiday_date === d || o.substitute_date === d) &&
      periodsOverlap(o.unit === "half_day" ? o.period : null, period)
  );
  if (clash) return { error: "วันที่เลือกมีคำขอสลับวันหยุดอื่นของพนักงานคนนี้อยู่แล้ว กรุณาเลือกวันอื่น" };

  const wasApproved = current.status === "approved";
  if (wasApproved) {
    const { error: reopenError } = await supabase.rpc("reopen_holiday_swap_request", { p_request_id: requestId });
    if (reopenError) return { error: reopenError.message };
  }

  const { error: updateError } = await supabase
    .from("holiday_swap_requests")
    .update({
      holiday_date: input.firstDate,
      substitute_date: input.substituteDate,
      unit: input.unit,
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
      await decideHolidaySwapRequest(requestId, "approved");
    } catch (e) {
      return { error: `บันทึกการแก้ไขแล้ว แต่อนุมัติใหม่ไม่สำเร็จ (คำขอเป็นรออนุมัติ กรุณากดอนุมัติ): ${e instanceof Error ? e.message : ""}` };
    }
  }

  revalidatePath("/holiday-swap");
  revalidatePath("/attendance");
}
