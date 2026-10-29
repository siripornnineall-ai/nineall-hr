import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signAvatarUrls } from "@/lib/avatars";
import { explainDayLeave } from "@/lib/leaveDuration";

// work_date is a plain YYYY-MM-DD with no time component, so parsing it as UTC midnight and
// reading getUTCDay() back out is just calendar arithmetic — never affected by server/client
// timezone the way a real instant would be.
function weekdayOf(workDate: string): number {
  return new Date(`${workDate}T00:00:00Z`).getUTCDay();
}

// shift_assignments only ever has rows from around "today" forward — nothing backfills it
// for past dates (see /schedule) — so a past date genuinely has no row even for an
// employee's completely ordinary weekly day off. Infer each employee's regular off-weekdays
// from whatever rows they DO have, using the occurrence of each weekday CLOSEST TO TODAY
// (not a majority vote across the whole ~180-day window) — the /schedule page is what HR
// actually edits, and a schedule genuinely changed partway through that window would
// otherwise get diluted by stale rows from before the change instead of reflecting what's
// actually set right now.
async function inferRegularDayOffWeekdays(supabase: SupabaseClient, orgId: string): Promise<Map<string, Set<number>>> {
  const { data: rows } = await supabase.from("shift_assignments").select("employee_id, work_date, is_day_off").eq("org_id", orgId);

  const todayMs = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date())}T00:00:00Z`).getTime();
  const closest = new Map<string, Map<number, { isDayOff: boolean; distanceMs: number }>>();
  const hasWorkingRow = new Map<string, boolean>();
  for (const r of rows ?? []) {
    if (!r.is_day_off) hasWorkingRow.set(r.employee_id, true);

    const weekday = weekdayOf(r.work_date);
    const distanceMs = Math.abs(new Date(`${r.work_date}T00:00:00Z`).getTime() - todayMs);
    let byWeekday = closest.get(r.employee_id);
    if (!byWeekday) {
      byWeekday = new Map();
      closest.set(r.employee_id, byWeekday);
    }
    const existing = byWeekday.get(weekday);
    if (!existing || distanceMs < existing.distanceMs) byWeekday.set(weekday, { isDayOff: r.is_day_off, distanceMs });
  }

  const result = new Map<string, Set<number>>();
  for (const [employeeId, byWeekday] of closest) {
    // An employee with zero "working" rows anywhere (e.g. someone who has never had a real
    // shift on file, only ever WFH marked in by hand) gives no real signal here — every
    // weekday would trivially read as their day off, which is wrong. Skip inference
    // entirely for them.
    if (!hasWorkingRow.get(employeeId)) continue;

    const weekdays = new Set<number>();
    for (const [weekday, entry] of byWeekday) {
      if (entry.isDayOff) weekdays.add(weekday);
    }
    result.set(employeeId, weekdays);
  }
  return result;
}

// Public holidays never had any presence on the Attendance page — employees who correctly
// stayed home simply didn't show up in the list at all, indistinguishable from any other
// unrecorded day. Called from the Attendance page itself (idempotent — safe to re-run on
// every view) rather than only when a holiday is first configured, so it stays correct even
// for employees hired after the holiday was set up.
export async function syncHolidayAttendance(orgId: string, workDate: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: holiday } = await supabase.from("company_holidays").select("name").eq("org_id", orgId).eq("holiday_date", workDate).maybeSingle();
  if (!holiday) return null;

  const [{ data: employees }, { data: existingRecords }, { data: approvedSwaps }] = await Promise.all([
    // lte hire_date: an employee hired after this date wasn't on payroll yet — they never
    // "should have" a holiday record for it.
    supabase.from("employees").select("id").eq("org_id", orgId).is("deleted_at", null).in("employment_status", ["active", "probation"]).lte("hire_date", workDate),
    supabase.from("attendance_records").select("employee_id").eq("org_id", orgId).eq("work_date", workDate),
    supabase.from("holiday_swap_requests").select("employee_id").eq("org_id", orgId).eq("holiday_date", workDate).eq("status", "approved"),
  ]);

  const hasRecord = new Set((existingRecords ?? []).map((r) => r.employee_id));
  // Owner rule (2026-10-15): whoever did not clock in on a public holiday is simply off for
  // it; only an approved swap means they were meant to work it. The shift schedule is not
  // consulted — a 7-day schedule would otherwise hide the holiday for everyone on it.
  const scheduledToWork = new Set((approvedSwaps ?? []).map((a) => a.employee_id));

  // Only employees with no record yet and no explicit override to work through the
  // holiday get marked — someone scheduled to work it (e.g. a swapped day off) keeps
  // whatever their real attendance turns out to be instead of being overwritten.
  const toMark = (employees ?? []).filter((e) => !hasRecord.has(e.id) && !scheduledToWork.has(e.id));
  if (toMark.length > 0) {
    // ignoreDuplicates (not a plain insert) — this runs on every page view, so a second
    // concurrent view of the same date must not error on the unique (employee_id, work_date).
    await supabase.from("attendance_records").upsert(
      toMark.map((e) => ({
        org_id: orgId,
        employee_id: e.id,
        work_date: workDate,
        status: "holiday" as const,
        late_minutes: 0,
        early_leave_minutes: 0,
        worked_minutes: 0,
        needs_review: false,
      })),
      { onConflict: "employee_id,work_date", ignoreDuplicates: true }
    );
  }

  return holiday.name;
}

// Same gap as the holiday case above, but for an employee's regular scheduled day off
// (e.g. a weekly Sunday off from the /schedule editor) on an otherwise ordinary date —
// they correctly didn't clock in, so they just didn't appear on the page at all. Run
// this after syncHolidayAttendance so a holiday date's employees (already given a
// "holiday" row above) aren't re-marked here.
export async function syncDayOffAttendance(orgId: string, workDate: string): Promise<void> {
  const supabase = await createClient();

  const [{ data: assignments }, { data: existingRecords }, { data: employees }, inferredWeekdays] = await Promise.all([
    supabase.from("shift_assignments").select("employee_id").eq("org_id", orgId).eq("work_date", workDate).eq("is_day_off", true),
    supabase.from("attendance_records").select("employee_id").eq("org_id", orgId).eq("work_date", workDate),
    supabase.from("employees").select("id").eq("org_id", orgId).is("deleted_at", null).in("employment_status", ["active", "probation"]).lte("hire_date", workDate),
    inferRegularDayOffWeekdays(supabase, orgId),
  ]);

  const hasRecord = new Set((existingRecords ?? []).map((r) => r.employee_id));
  const explicitDayOff = new Set((assignments ?? []).map((a) => a.employee_id));
  const weekday = weekdayOf(workDate);

  // Explicit shift_assignments row wins when there is one; otherwise fall back to the
  // employee's inferred regular pattern — this is what actually catches a past date with
  // no row at all (shift_assignments is never backfilled for past dates).
  const toMarkIds = new Set(explicitDayOff);
  for (const e of employees ?? []) {
    if (!explicitDayOff.has(e.id) && (inferredWeekdays.get(e.id)?.has(weekday) ?? false)) toMarkIds.add(e.id);
  }

  const toMark = Array.from(toMarkIds).filter((id) => !hasRecord.has(id));
  if (toMark.length > 0) {
    await supabase.from("attendance_records").upsert(
      toMark.map((employeeId) => ({
        org_id: orgId,
        employee_id: employeeId,
        work_date: workDate,
        status: "day_off" as const,
        late_minutes: 0,
        early_leave_minutes: 0,
        worked_minutes: 0,
        needs_review: false,
      })),
      { onConflict: "employee_id,work_date", ignoreDuplicates: true }
    );
  }
}

// For a date that's already over, anyone still left with no attendance_records row after
// the holiday/day-off syncs above genuinely didn't show up — mark them "ขาดงาน" instead of
// leaving the day blank. Never called for today: the day may still be in progress, and
// someone who simply hasn't clocked in yet isn't necessarily absent.
export async function syncAbsentAttendance(orgId: string, workDate: string): Promise<void> {
  const supabase = await createClient();

  const [{ data: employees }, { data: existingRecords }, { data: dateAssignments }, { data: recentAssignments }] = await Promise.all([
    // lte hire_date: someone hired after this date wasn't employed yet, so they can't have
    // been absent from a job they didn't have. attendance_exempt (owners/CEOs/managers who
    // are paid their full salary regardless of clocking in at all) never gets auto-marked
    // absent — there's nothing for them to be "absent" from.
    supabase
      .from("employees")
      .select("id")
      .eq("org_id", orgId)
      .eq("attendance_exempt", false)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .lte("hire_date", workDate),
    supabase.from("attendance_records").select("employee_id").eq("org_id", orgId).eq("work_date", workDate),
    supabase.from("shift_assignments").select("employee_id, shift_id, work_location_id, is_day_off").eq("org_id", orgId).eq("work_date", workDate),
    // Fallback for an employee with no shift_assignments row on workDate at all (the exact
    // gap this function exists for) — their most recent row that actually has a shift is
    // "what they'd normally be working", attached to the absent record instead of leaving
    // it shift-less.
    supabase
      .from("shift_assignments")
      .select("employee_id, shift_id, work_location_id, work_date")
      .eq("org_id", orgId)
      .not("shift_id", "is", null)
      .order("work_date", { ascending: false })
      .limit(2000),
  ]);

  const hasRecord = new Set((existingRecords ?? []).map((r) => r.employee_id));
  const dateAssignmentByEmployee = new Map((dateAssignments ?? []).map((a) => [a.employee_id, a]));
  const isDayOff = new Set((dateAssignments ?? []).filter((a) => a.is_day_off).map((a) => a.employee_id));

  const mostRecentShiftByEmployee = new Map<string, { shift_id: string; work_location_id: string | null }>();
  for (const a of recentAssignments ?? []) {
    if (!mostRecentShiftByEmployee.has(a.employee_id)) mostRecentShiftByEmployee.set(a.employee_id, { shift_id: a.shift_id!, work_location_id: a.work_location_id });
  }

  const toMark = (employees ?? []).filter((e) => !hasRecord.has(e.id) && !isDayOff.has(e.id));
  if (toMark.length > 0) {
    await supabase.from("attendance_records").upsert(
      toMark.map((e) => {
        const dateAssignment = dateAssignmentByEmployee.get(e.id);
        const fallback = mostRecentShiftByEmployee.get(e.id);
        return {
          org_id: orgId,
          employee_id: e.id,
          work_date: workDate,
          status: "absent" as const,
          shift_id: dateAssignment?.shift_id ?? fallback?.shift_id ?? null,
          work_location_id: dateAssignment?.work_location_id ?? fallback?.work_location_id ?? null,
          late_minutes: 0,
          early_leave_minutes: 0,
          worked_minutes: 0,
          needs_review: false,
        };
      }),
      { onConflict: "employee_id,work_date", ignoreDuplicates: true }
    );
  }
}

export interface AttendanceRow {
  id: string;
  workDate: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  photoUrl: string | null;
  clockIn: string | null;
  clockOut: string | null;
  status: string;
  statusDetail: string | null;
  lateMinutes: number;
  otMinutes: number;
  withinGeofence: boolean | null;
  selfiePath: string | null;
  needsReview: boolean;
  shiftId: string | null;
  workLocationId: string | null;
}

export async function listAttendanceForDate(orgId: string, workDate: string) {
  const supabase = await createClient();
  const query = supabase
    .from("attendance_records")
    .select(
      "id, work_date, employee_id, clock_in_server_at, clock_out_server_at, status, late_minutes, ot_minutes, clock_in_within_geofence, clock_in_selfie_path, needs_review, shift_id, work_location_id, employees!inner(employee_code, first_name, last_name, photo_url, manager_employee_id, hide_late_status)"
    )
    .eq("org_id", orgId)
    .eq("work_date", workDate)
    .not("employees.employment_status", "in", "(resigned,terminated)")
    .order("clock_in_server_at", { ascending: true });

  const [{ data, error }, { data: holiday }, { data: leaveRows }, { data: swapDayOffs }, { data: holidayWorkers }] = await Promise.all([
    query,
    supabase.from("company_holidays").select("name").eq("org_id", orgId).eq("holiday_date", workDate).maybeSingle(),
    // "ลา" alone doesn't say which kind — look up the approved leave covering this date per
    // employee so the row can show "ลาป่วย"/"ลากิจ"/etc instead of just the bare status.
    supabase
      .from("leave_requests")
      .select("employee_id, unit, start_time, end_time, total_days, status, leave_types(name_th)")
      .eq("org_id", orgId)
      .in("status", ["approved", "pending"])
      .lte("start_date", workDate)
      .gte("end_date", workDate),
    // A day off that came from a swap (not the regular weekly day off) is labelled as such.
    supabase.from("shift_assignments").select("employee_id, source").eq("org_id", orgId).eq("work_date", workDate).eq("is_day_off", true).in("source", ["holiday_swap", "day_off_swap"]),
    // People who worked this public holiday because they swapped it for another day.
    supabase.from("holiday_swap_requests").select("employee_id").eq("org_id", orgId).eq("holiday_date", workDate).eq("status", "approved"),
  ]);
  if (error) throw error;
  const swapLabelByEmployee = new Map((swapDayOffs ?? []).map((s) => [s.employee_id, s.source === "holiday_swap" ? "สลับวันหยุดนักขัตฤกษ์" : "สลับวันหยุดประจำ"]));
  const workedHolidayBySwap = new Set((holidayWorkers ?? []).map((s) => s.employee_id));

  const leaveTypeNameByEmployee = new Map(
    (leaveRows ?? []).filter((l) => l.status === "approved").map((l) => [l.employee_id, (l.leave_types as unknown as { name_th: string } | null)?.name_th ?? null])
  );
  // Every leave (pending or approved) on file for the day, per employee, to explain late / early-leave rows.
  const leavesByEmployee = new Map<string, { typeName: string | null; unit: string | null; totalDays: number; startTime: string | null; endTime: string | null; status: string }[]>();
  for (const l of leaveRows ?? []) {
    const list = leavesByEmployee.get(l.employee_id) ?? [];
    list.push({
      typeName: (l.leave_types as unknown as { name_th: string } | null)?.name_th ?? null,
      unit: l.unit as string | null,
      totalDays: Number(l.total_days),
      startTime: l.start_time as string | null,
      endTime: l.end_time as string | null,
      status: l.status as string,
    });
    leavesByEmployee.set(l.employee_id, list);
  }

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  // Staff on the "late shown as on time when the time after the shift covers it" rule (hide_late_status): ask the
  // database which of their late days are covered and which days' spare time paid for it (and, for a day whose
  // spare time was used, which late days it paid for); the rest show as late.
  const coveredLateEmployees = new Set<string>();
  const coverNoteByEmployee = new Map<string, string>();
  const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
  await Promise.all(
    (data ?? [])
      .filter((r) => (r.employees as unknown as { hide_late_status: boolean | null } | null)?.hide_late_status)
      .map(async (r) => {
        const { data: details } = await supabase.rpc("late_cover_details", { p_employee_id: r.employee_id, p_from: workDate, p_to: workDate });
        const rowsD = (details ?? []) as { late_date: string; source_date: string; minutes_used: number }[];
        const own = rowsD.filter((d) => d.late_date === workDate);
        const used = rowsD.filter((d) => d.source_date === workDate);
        const parts: string[] = [];
        if (r.status === "late" && own.length > 0) {
          coveredLateEmployees.add(r.employee_id);
          parts.push(`สาย ${r.late_minutes} นาที หักจากเวลาอยู่ทด: ${own.map((d) => `${fmtDay(d.source_date)} (${d.minutes_used} น.)`).join(", ")}`);
        }
        if (used.length > 0) {
          parts.push(`ใช้เวลาอยู่ทดหักสายวันอื่นไป ${used.reduce((s, d) => s + d.minutes_used, 0)} นาที: ${used.map((d) => `สาย ${fmtDay(d.late_date)} (${d.minutes_used} น.)`).join(", ")}`);
        }
        if (parts.length > 0) coverNoteByEmployee.set(r.employee_id, parts.join(" · "));
      })
  );

  const rows: AttendanceRow[] = (data ?? []).map((r) => {
    const emp = r.employees as unknown as {
      employee_code: string;
      first_name: string;
      last_name: string;
      photo_url: string | null;
      manager_employee_id: string | null;
      hide_late_status: boolean | null;
    };
    const statusDetail =
      r.status === "leave"
        ? (leaveTypeNameByEmployee.get(r.employee_id) ?? null)
        : r.status === "holiday"
          ? (holiday?.name ?? null)
          : r.status === "day_off"
            ? (swapLabelByEmployee.get(r.employee_id) ?? null)
            : holiday && workedHolidayBySwap.has(r.employee_id)
              ? "มาทำงานวันนักขัตฤกษ์ (สลับหยุดวันอื่น)"
              : emp?.hide_late_status && coverNoteByEmployee.has(r.employee_id)
                ? coverNoteByEmployee.get(r.employee_id)!
                : explainDayLeave(leavesByEmployee.get(r.employee_id) ?? [], r.status);
    return {
      id: r.id,
      workDate: r.work_date,
      employeeId: r.employee_id,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      photoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
      clockIn: r.clock_in_server_at,
      clockOut: r.clock_out_server_at,
      // Ice / Kanin: shown as on time; the late minutes still drive the OT deduction.
      status: r.status === "late" && emp?.hide_late_status && coveredLateEmployees.has(r.employee_id) ? "on_time" : r.status,
      statusDetail,
      // Late minutes taken off OT are not shown (the number only confused: owner 2026-10-26).
      lateMinutes: r.status === "late" && emp?.hide_late_status && coveredLateEmployees.has(r.employee_id) ? 0 : r.late_minutes,
      otMinutes: r.ot_minutes,
      withinGeofence: r.clock_in_within_geofence,
      selfiePath: r.clock_in_selfie_path,
      needsReview: r.needs_review,
      shiftId: r.shift_id,
      workLocationId: r.work_location_id,
    };
  });

  return rows;
}
