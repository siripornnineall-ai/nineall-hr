import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { Avatar } from "@/components/Avatar";
import { AddBackdatedAttendanceForm } from "./AddBackdatedAttendanceForm";
import { EmployeeAttendanceRow } from "./EmployeeAttendanceRow";
import { signAvatarUrls } from "@/lib/avatars";
import { getOtWindowFor, currentOtCutoffMonthKey } from "@/lib/otCutoff";
import { lateMinutesFromPrevCycleRule } from "@/lib/lateDeduction";
import { explainDayLeave } from "@/lib/leaveDuration";

function parseMonth(month: string | undefined): { year: number; monthIndex: number } {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    return { year: y, monthIndex: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export default async function EmployeeAttendanceDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requireUser();
  const { employeeId } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();

  const { year, monthIndex } = parseMonth(month);
  const monthStart = new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);
  const prevMonthKey = monthKey(monthIndex === 0 ? year - 1 : year, monthIndex === 0 ? 11 : monthIndex - 1);
  const nextMonthKey = monthKey(monthIndex === 11 ? year + 1 : year, monthIndex === 11 ? 0 : monthIndex + 1);

  const { data: employee } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name, photo_url, hide_late_status, late_deduct_from_prev_ot_since, ot_calendar_month, job_positions(title), departments(name)")
    .eq("org_id", user.orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) notFound();

  let photoUrl: string | null = null;
  if (employee.photo_url) {
    photoUrl = (await signAvatarUrls(supabase, [employee.photo_url])).get(employee.photo_url) ?? null;
  }
  const position = (employee.job_positions as unknown as { title: string } | null)?.title ?? null;
  const department = (employee.departments as unknown as { name: string } | null)?.name ?? null;

  // Days off from the shift schedule and public holidays are written as attendance rows by a
  // nightly job; run it for this month too so a day off that was scheduled late still shows.
  await supabase.rpc("sync_scheduled_days_off_attendance", { p_from: monthStart, p_to: monthEnd, p_employee_id: employeeId });

  const [{ data: records }, { data: leaveRows }, { data: holidayRows }, { data: swapDayOffRows }, { data: holidaySwapRows }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("id, work_date, status, clock_in_server_at, clock_out_server_at, late_minutes, ot_minutes, shift_id, work_location_id")
      .eq("org_id", user.orgId)
      .eq("employee_id", employeeId)
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd)
      .order("work_date", { ascending: false }),
    // "ลา" alone doesn't say which kind — same per-date leave-type lookup used on the main
    // Attendance list (listAttendanceForDate), but this page never had it wired in at all.
    supabase
      .from("leave_requests")
      .select("start_date, end_date, unit, start_time, end_time, total_days, status, leave_types(name_th)")
      .eq("org_id", user.orgId)
      .eq("employee_id", employeeId)
      .in("status", ["approved", "pending"])
      .lte("start_date", monthEnd)
      .gte("end_date", monthStart),
    supabase.from("company_holidays").select("holiday_date, name").eq("org_id", user.orgId).gte("holiday_date", monthStart).lte("holiday_date", monthEnd),
    supabase
      .from("shift_assignments")
      .select("work_date, source")
      .eq("employee_id", employeeId)
      .eq("is_day_off", true)
      .in("source", ["holiday_swap", "day_off_swap"])
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd),
    supabase.from("holiday_swap_requests").select("holiday_date").eq("employee_id", employeeId).eq("status", "approved").gte("holiday_date", monthStart).lte("holiday_date", monthEnd),
  ]);
  const swapLabelByDate = new Map((swapDayOffRows ?? []).map((r) => [r.work_date, r.source === "holiday_swap" ? "สลับวันหยุดนักขัตฤกษ์" : "สลับวันหยุดประจำ"]));
  const workedHolidayBySwap = new Set((holidaySwapRows ?? []).map((r) => r.holiday_date));

  // Net OT for the current 26th-25th cycle: approved OT minus the lateness that comes off it.
  const otWindow = getOtWindowFor(!!employee.ot_calendar_month, currentOtCutoffMonthKey());
  const [{ data: otRows }, { data: lateRows }] = await Promise.all([
    supabase.from("overtime_requests").select("approved_hours, requested_hours").eq("employee_id", employeeId).eq("status", "approved").gte("work_date", otWindow.start).lte("work_date", otWindow.end),
    supabase.from("attendance_records").select("late_minutes").eq("employee_id", employeeId).eq("status", "late").gt("late_minutes", 0).gte("work_date", otWindow.start).lte("work_date", otWindow.end),
  ]);
  const cycleOtHours = (otRows ?? []).reduce((sum, o) => sum + Number(o.approved_hours ?? o.requested_hours ?? 0), 0);
  const cycleLateMinutes = employee.late_deduct_from_prev_ot_since
    ? await lateMinutesFromPrevCycleRule(supabase, { orgId: user.orgId, employeeId, since: employee.late_deduct_from_prev_ot_since, monthKey: currentOtCutoffMonthKey(), capToOwnRun: true })
    : (lateRows ?? []).reduce((sum, r) => sum + (r.late_minutes ?? 0), 0);
  const cycleNetOtHours = Math.max(0, cycleOtHours - cycleLateMinutes / 60);
  const fmtCycleDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });

  // Late days covered by OT show as on time for staff on that rule; uncovered ones stay "late".
  // For each covered late day: which days' time after the shift end paid for it, and how many minutes (and the
  // other way round for the days whose spare time was used), so nobody has to guess where the minutes went.
  const coveredLate = new Set<string>();
  const lateSources = new Map<string, { date: string; minutes: number }[]>();
  const spareUses = new Map<string, { date: string; minutes: number }[]>();
  if (employee.hide_late_status) {
    const { data: details } = await supabase.rpc("late_cover_details", { p_employee_id: employeeId, p_from: monthStart, p_to: monthEnd });
    for (const d of (details ?? []) as { late_date: string; source_date: string; minutes_used: number }[]) {
      if (d.late_date >= monthStart && d.late_date <= monthEnd) {
        coveredLate.add(d.late_date);
        lateSources.set(d.late_date, [...(lateSources.get(d.late_date) ?? []), { date: d.source_date, minutes: d.minutes_used }]);
      }
      if (d.source_date >= monthStart && d.source_date <= monthEnd) {
        spareUses.set(d.source_date, [...(spareUses.get(d.source_date) ?? []), { date: d.late_date, minutes: d.minutes_used }]);
      }
    }
  }
  const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "UTC" });
  const coverNote = (workDate: string, lateMinutes: number): string | null => {
    const src = lateSources.get(workDate);
    const uses = spareUses.get(workDate);
    const parts: string[] = [];
    if (src) parts.push(`สาย ${lateMinutes} นาที หักจากเวลาอยู่ทด: ${src.map((s) => `${fmtDay(s.date)} (${s.minutes} น.)`).join(", ")}`);
    if (uses) parts.push(`ใช้เวลาอยู่ทดหักสายวันอื่นไป ${uses.reduce((sum, u) => sum + u.minutes, 0)} นาที: ${uses.map((u) => `สาย ${fmtDay(u.date)} (${u.minutes} น.)`).join(", ")}`);
    return parts.length ? parts.join(" · ") : null;
  };
  const holidayNameByDate = new Map((holidayRows ?? []).map((h) => [h.holiday_date, h.name]));
  function leavesForDate(workDate: string) {
    return (leaveRows ?? [])
      .filter((l) => l.start_date <= workDate && l.end_date >= workDate)
      .map((l) => ({
        typeName: (l.leave_types as unknown as { name_th: string } | null)?.name_th ?? null,
        unit: l.unit as string | null,
        totalDays: Number(l.total_days),
        startTime: l.start_time as string | null,
        endTime: l.end_time as string | null,
        status: l.status as string,
      }));
  }
  function leaveTypeForDate(workDate: string): string | null {
    for (const l of leaveRows ?? []) {
      if (l.status === "approved" && l.start_date <= workDate && l.end_date >= workDate) return (l.leave_types as unknown as { name_th: string } | null)?.name_th ?? null;
    }
    return null;
  }

  const { data: shifts } = await supabase.from("work_shifts").select("id, name").eq("org_id", user.orgId).order("name");
  const { data: workLocations } = await supabase.from("work_locations").select("id, name").eq("org_id", user.orgId).order("name");

  // The employee's normal fixed shift/location (see ShiftAssignment.tsx) is written as a
  // 365-day-forward block of shift_assignments rows all pointing at the same shift/location —
  // any single row tells us what "normal" is, used to pre-fill the backdated-entry form.
  const { data: defaultAssignment } = await supabase
    .from("shift_assignments")
    .select("shift_id, work_location_id")
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId)
    .order("work_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const headOfficeLocation = (workLocations ?? []).find((l) => l.name.includes("สำนักงานใหญ่") || l.name.toLowerCase().includes("head office"));
  const defaultShiftId = defaultAssignment?.shift_id ?? "";
  const defaultWorkLocationId = defaultAssignment?.work_location_id ?? headOfficeLocation?.id ?? "";

  const rows = records ?? [];
  const count = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;
  const workedDays = count(["on_time", "late", "work_from_home", "off_site", "early_leave"]);
  const lateDays = rows.filter((r) => r.status === "late" && !coveredLate.has(r.work_date)).length;
  const leaveDays = count(["leave"]);
  const absentDays = count(["absent"]);
  const holidayDays = count(["holiday"]);
  const totalLateMinutes = rows.reduce((sum, r) => sum + (r.status === "late" && coveredLate.has(r.work_date) ? 0 : (r.late_minutes ?? 0)), 0);
  const totalOtHours = rows.reduce((sum, r) => sum + (r.ot_minutes ?? 0), 0) / 60;

  const monthLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <Topbar
        title={`${employee.first_name} ${employee.last_name}`}
        subtitle={`${employee.employee_code} • ${position ?? "-"} • ${department ?? "-"}`}
        backHref="/attendance"
      />
      <div className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar url={photoUrl} size={40} />
            <div>
              <p className="font-bold text-on-surface">
                {employee.first_name} {employee.last_name}
              </p>
              <p className="text-xs text-on-surface-variant">{employee.employee_code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`?month=${prevMonthKey}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              ← เดือนก่อน
            </Link>
            <span className="min-w-[130px] text-center text-sm font-bold text-on-surface">{monthLabel}</span>
            <Link href={`?month=${nextMonthKey}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              เดือนถัดไป →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard label="มาทำงาน" value={`${workedDays} วัน`} icon="how_to_reg" accent="success" />
          <StatCard label="มาสาย" value={`${lateDays} วัน`} icon="alarm" accent="warning" hint={totalLateMinutes > 0 ? `รวม ${totalLateMinutes} นาที` : undefined} />
          <StatCard label="ลา" value={`${leaveDays} วัน`} icon="event_busy" accent="info" />
          <StatCard label="ขาดงาน" value={`${absentDays} วัน`} icon="person_off" accent="danger" />
          <StatCard label="OT" value={`${totalOtHours.toFixed(1)} ชม.`} icon="timer" accent="primary" hint={holidayDays > 0 ? `วันหยุด ${holidayDays} วัน` : undefined} />
        </div>

        <div className="rounded-xl border border-outline-variant bg-white px-4 py-3 text-sm shadow-sm">
          <span className="font-bold text-on-surface">OT รอบนี้ ({fmtCycleDate(otWindow.start)} – {fmtCycleDate(otWindow.end)}):</span>{" "}
          <span className="text-on-surface-variant">
            OT อนุมัติ {cycleOtHours.toFixed(2)} ชม. − หักมาสาย {cycleLateMinutes} นาที ={" "}
            <span className="font-bold text-on-surface">สุทธิ {cycleNetOtHours.toFixed(2)} ชม.</span>
          </span>
        </div>

        <AddBackdatedAttendanceForm
          employeeId={employee.id}
          shifts={shifts ?? []}
          workLocations={workLocations ?? []}
          defaultShiftId={defaultShiftId}
          defaultWorkLocationId={defaultWorkLocationId}
        />

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เข้างาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ออกงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สาย (นาที)</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">OT (นาที)</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีข้อมูลการลงเวลาในเดือนนี้
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <EmployeeAttendanceRow
                    key={r.id}
                    row={{
                      id: r.id,
                      workDate: r.work_date,
                      workDateLabel: new Date(r.work_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }),
                      clockIn: r.clock_in_server_at,
                      clockOut: r.clock_out_server_at,
                      lateMinutes: r.status === "late" && coveredLate.has(r.work_date) ? 0 : (r.late_minutes ?? 0),
                      otMinutes: r.ot_minutes ?? 0,
                      status: r.status === "late" && coveredLate.has(r.work_date) ? "on_time" : r.status,
                      statusDetail:
                        r.status === "leave"
                          ? leaveTypeForDate(r.work_date)
                          : r.status === "holiday"
                            ? (holidayNameByDate.get(r.work_date) ?? null)
                            : r.status === "day_off"
                              ? (swapLabelByDate.get(r.work_date) ?? null)
                              : workedHolidayBySwap.has(r.work_date)
                                ? "มาทำงานวันนักขัตฤกษ์ (สลับหยุดวันอื่น)"
                                : (r.status === "late" && coveredLate.has(r.work_date)) || spareUses.has(r.work_date)
                                  ? coverNote(r.work_date, r.late_minutes ?? 0)
                                  : explainDayLeave(leavesForDate(r.work_date), r.status),
                      shiftId: r.shift_id,
                      workLocationId: r.work_location_id,
                    }}
                    shifts={shifts ?? []}
                    workLocations={workLocations ?? []}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
