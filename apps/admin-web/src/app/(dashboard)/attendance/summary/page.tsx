import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { getOtCutoffWindow, getOtWindowFor, currentOtCutoffMonthKey, shiftOtCutoffMonthKey } from "@/lib/otCutoff";
import { ExportCsvButton } from "./ExportCsvButton";

// Month summary for payroll (owner 2026-10-26): per employee, how many days worked, how many hours,
// and every kind of leave counted exactly: hourly leave in hours/minutes AND as the days the
// system stores, half-days, full days. Two period modes: the calendar month, or the 26th-25th
// cycle that OT is paid on.

type Mode = "month" | "cycle";

const WORKED_STATUSES = new Set(["on_time", "late", "early_leave", "work_from_home", "off_site"]);

function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} นาที`;
  return r === 0 ? `${h} ชม.` : `${h} ชม. ${r} นาที`;
}

const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function monthRange(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

function currentMonthKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()).slice(0, 7);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// PostgREST returns at most 1000 rows per request; a month for ~30 people is more than that.
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

interface LeaveLine {
  typeName: string;
  code: string;
  unit: string;
  date: string;
  days: number;
  minutes: number; // hourly only (lunch excluded)
}

export default async function AttendanceSummaryPage({ searchParams }: { searchParams: Promise<{ month?: string; mode?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const mode: Mode = sp.mode === "cycle" ? "cycle" : "month";
  const monthKey = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : mode === "cycle" ? currentOtCutoffMonthKey() : currentMonthKey();
  const { start, end } = mode === "cycle" ? getOtCutoffWindow(monthKey) : monthRange(monthKey);
  const prevKey = mode === "cycle" ? shiftOtCutoffMonthKey(monthKey, -1) : shiftMonthKey(monthKey, -1);
  const nextKey = mode === "cycle" ? shiftOtCutoffMonthKey(monthKey, 1) : shiftMonthKey(monthKey, 1);
  const supabase = await createClient();

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name, nickname, hire_date, ot_calendar_month, departments(name)")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .in("employment_status", ["active", "probation"])
    .lte("hire_date", end)
    .order("employee_code");

  // OT window per person: 26th-25th, or the calendar month for staff flagged ot_calendar_month.
  const otCycle = getOtCutoffWindow(monthKey);
  const otCal = getOtWindowFor(true, monthKey);
  const otFetchStart = otCycle.start < otCal.start ? otCycle.start : otCal.start;
  const otFetchEnd = otCycle.end > otCal.end ? otCycle.end : otCal.end;

  const [attendance, assignments, leaves, ot] = await Promise.all([
    fetchAll<{ employee_id: string; work_date: string; status: string; worked_minutes: number | null; late_minutes: number | null; early_leave_minutes: number | null }>((from, to) =>
      supabase.from("attendance_records").select("employee_id, work_date, status, worked_minutes, late_minutes, early_leave_minutes").eq("org_id", user.orgId).gte("work_date", start).lte("work_date", end).range(from, to)
    ),
    fetchAll<{ employee_id: string; is_day_off: boolean }>((from, to) =>
      supabase.from("shift_assignments").select("employee_id, is_day_off").eq("org_id", user.orgId).gte("work_date", start).lte("work_date", end).range(from, to)
    ),
    fetchAll<{
      employee_id: string; unit: string | null; start_date: string; end_date: string; start_time: string | null; end_time: string | null; total_days: number; leave_types: { name_th: string; code: string } | null;
    }>((from, to) =>
      supabase
        .from("leave_requests")
        .select("employee_id, unit, start_date, end_date, start_time, end_time, total_days, leave_types(name_th, code)")
        .eq("org_id", user.orgId)
        .eq("status", "approved")
        .lte("start_date", end)
        .gte("end_date", start)
        .range(from, to)
    ),
    fetchAll<{ employee_id: string; work_date: string; approved_hours: number | null; requested_hours: number }>((from, to) =>
      supabase.from("overtime_requests").select("employee_id, work_date, approved_hours, requested_hours").eq("org_id", user.orgId).eq("status", "approved").gte("work_date", otFetchStart).lte("work_date", otFetchEnd).range(from, to)
    ),
  ]);

  const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const dayCount = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000) + 1;

  const rows = (employees ?? []).map((e) => {
    const att = attendance.filter((a) => a.employee_id === e.id);
    const count = (pred: (s: string) => boolean) => att.filter((a) => pred(a.status)).length;
    const workedDays = count((s) => WORKED_STATUSES.has(s));
    const workedMinutes = att.filter((a) => WORKED_STATUSES.has(a.status)).reduce((sum, a) => sum + (a.worked_minutes ?? 0), 0);
    const lateMinutes = att.reduce((sum, a) => sum + (a.status === "late" || (a.late_minutes ?? 0) > 0 ? (a.late_minutes ?? 0) : 0), 0);
    const earlyMinutes = att.reduce((sum, a) => sum + (a.early_leave_minutes ?? 0), 0);
    const scheduledDays = assignments.filter((a) => a.employee_id === e.id && !a.is_day_off).length;

    const lines: LeaveLine[] = [];
    for (const l of leaves.filter((x) => x.employee_id === e.id)) {
      const typeName = l.leave_types?.name_th ?? "-";
      const code = l.leave_types?.code ?? "";
      const unit = l.unit ?? "full_day";
      // Requests that straddle the period edge count only their days inside it.
      const total = Number(l.total_days);
      const span = dayCount(l.start_date, l.end_date);
      const inside = dayCount(l.start_date < start ? start : l.start_date, l.end_date > end ? end : l.end_date);
      const days = unit === "full_day" && span > 0 ? Math.round(total * (inside / span) * 100) / 100 : total;
      let minutes = 0;
      if (unit === "hourly") {
        const s = toMin(l.start_time);
        const t = toMin(l.end_time);
        if (s != null && t != null && t > s) minutes = t - s - Math.max(0, Math.min(t, 13 * 60) - Math.max(s, 12 * 60));
      }
      lines.push({ typeName, code, unit, date: l.start_date, days, minutes });
    }
    const leaveByType = new Map<string, { full: number; half: number; hourlyMinutes: number; hourlyDays: number; days: number }>();
    for (const l of lines) {
      const cur = leaveByType.get(l.typeName) ?? { full: 0, half: 0, hourlyMinutes: 0, hourlyDays: 0, days: 0 };
      cur.days += l.days;
      if (l.unit === "half_day") cur.half += 1;
      else if (l.unit === "hourly") {
        cur.hourlyMinutes += l.minutes;
        cur.hourlyDays += l.days;
      } else cur.full += l.days;
      leaveByType.set(l.typeName, cur);
    }
    const leaveText = Array.from(leaveByType.entries()).map(([name, v]) => {
      const parts: string[] = [];
      if (v.full > 0) parts.push(`${Math.round(v.full * 100) / 100} วัน`);
      if (v.half > 0) parts.push(`ครึ่งวัน ${v.half} ครั้ง`);
      if (v.hourlyMinutes > 0) parts.push(`รายชั่วโมง ${hm(v.hourlyMinutes)} (= ${Math.round(v.hourlyDays * 100) / 100} วัน)`);
      return `${name}: ${parts.join(" + ")} รวม ${Math.round(v.days * 100) / 100} วัน`;
    });
    const leaveDaysTotal = Math.round(lines.reduce((s, l) => s + l.days, 0) * 100) / 100;
    const hourlyMinutesTotal = lines.reduce((s, l) => s + l.minutes, 0);
    const hourlyDaysTotal = Math.round(lines.filter((l) => l.unit === "hourly").reduce((s, l) => s + l.days, 0) * 100) / 100;
    const otWin = e.ot_calendar_month ? otCal : otCycle;
    const otHours = ot.filter((o) => o.employee_id === e.id && o.work_date >= otWin.start && o.work_date <= otWin.end).reduce((s, o) => s + Number(o.approved_hours ?? o.requested_hours ?? 0), 0);

    return {
      id: e.id,
      code: e.employee_code,
      name: `${e.first_name} ${e.last_name}`,
      nickname: e.nickname as string | null,
      dept: (e.departments as unknown as { name: string } | null)?.name ?? "-",
      scheduledDays,
      workedDays,
      workedMinutes,
      lateMinutes,
      earlyMinutes,
      absentDays: count((s) => s === "absent"),
      dayOffDays: count((s) => s === "day_off"),
      holidayDays: count((s) => s === "holiday"),
      leaveDaysTotal,
      hourlyMinutesTotal,
      hourlyDaysTotal,
      leaveText,
      otHours: Math.round(otHours * 100) / 100,
    };
  });

  const csvRows = [
    ["รหัส", "ชื่อ", "แผนก", "วันทำงานตามตาราง", "มาทำงาน (วัน)", "ชั่วโมงทำงานรวม", "สาย (นาที)", "ออกก่อน (นาที)", "ขาดงาน (วัน)", "วันหยุดประจำ", "วันหยุดนักขัตฤกษ์", "ลารวม (วัน)", "ลารายชั่วโมงรวม", "ลารายชั่วโมง (วัน)", "รายละเอียดการลา", "OT อนุมัติ (ชม.)"],
    ...rows.map((r) => [
      r.code, r.name, r.dept, String(r.scheduledDays), String(r.workedDays), hm(r.workedMinutes), String(r.lateMinutes), String(r.earlyMinutes), String(r.absentDays), String(r.dayOffDays), String(r.holidayDays),
      String(r.leaveDaysTotal), r.hourlyMinutesTotal ? hm(r.hourlyMinutesTotal) : "-", String(r.hourlyDaysTotal), r.leaveText.join(" ; ") || "-", String(r.otHours),
    ]),
  ];

  const qs = (m: string) => `?mode=${mode}&month=${m}`;
  const periodLabel = `${fmtDate(start)} – ${fmtDate(end)}`;

  return (
    <>
      <Topbar title="สรุปวันทำงาน/ชั่วโมงรายเดือน" subtitle="ตัวเลขสำหรับทำเงินเดือน" backHref="/attendance" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`?mode=month&month=${mode === "month" ? monthKey : currentMonthKey()}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${mode === "month" ? "border-primary bg-primary text-white" : "border-outline-variant"}`}>
              เดือนปฏิทิน (1 – สิ้นเดือน)
            </Link>
            <Link href={`?mode=cycle&month=${mode === "cycle" ? monthKey : currentOtCutoffMonthKey()}`} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${mode === "cycle" ? "border-primary bg-primary text-white" : "border-outline-variant"}`}>
              รอบ OT (26 – 25)
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href={qs(prevKey)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              ← ก่อนหน้า
            </Link>
            <span className="min-w-[200px] text-center text-sm font-bold text-on-surface">{periodLabel}</span>
            <Link href={qs(nextKey)} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              ถัดไป →
            </Link>
          </div>
          <ExportCsvButton rows={csvRows} filename={`attendance-summary-${start}-${end}.csv`} />
        </div>

        <p className="text-xs text-on-surface-variant">
          ชั่วโมงทำงาน = เวลาลงเวลาจริงหักพักเที่ยง · ลารายชั่วโมงไม่นับช่วงพัก 12:00-13:00 และแปลงเป็นวันตามความยาวกะ · ใบลาที่ข้ามช่วงนี้นับเฉพาะวันที่อยู่ในช่วง · คนที่ลาออกไม่แสดง · OT: พนักงานทั่วไปนับรอบ 26 ถึง 25 ของเดือนนี้ ({fmtDate(otCycle.start)} – {fmtDate(otCycle.end)}) ส่วนพม่า/ลาวนับ 1 ถึงสิ้นเดือน ({fmtDate(otCal.start)} – {fmtDate(otCal.end)})
        </p>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  {["รหัส / ชื่อ", "วันทำงานตามตาราง", "มาทำงาน", "ชั่วโมงทำงานรวม", "สาย", "ออกก่อน", "ขาดงาน", "หยุดประจำ", "นักขัตฤกษ์", "ลา (วัน)", "ลารายชั่วโมง", "OT อนุมัติ"].map((h) => (
                    <th key={h} className="px-3 py-3 font-bold text-on-surface-variant">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีข้อมูล
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-3 py-3 font-semibold">
                      <Link href={`/attendance/${r.id}?month=${(mode === "cycle" ? end : start).slice(0, 7)}`} className="hover:text-primary hover:underline">
                        {r.nickname ? `${r.nickname} · ` : ""}
                        {r.name}
                      </Link>
                      <div className="text-xs font-normal text-on-surface-variant">
                        {r.code} · {r.dept}
                      </div>
                      {r.leaveText.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs font-normal text-on-surface-variant">
                          {r.leaveText.map((t) => (
                            <li key={t}>ลา · {t}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-3">{r.scheduledDays} วัน</td>
                    <td className="px-3 py-3 font-bold text-on-surface">{r.workedDays} วัน</td>
                    <td className="px-3 py-3">{hm(r.workedMinutes)}</td>
                    <td className="px-3 py-3">{r.lateMinutes > 0 ? hm(r.lateMinutes) : "-"}</td>
                    <td className="px-3 py-3">{r.earlyMinutes > 0 ? hm(r.earlyMinutes) : "-"}</td>
                    <td className="px-3 py-3">{r.absentDays > 0 ? `${r.absentDays} วัน` : "-"}</td>
                    <td className="px-3 py-3">{r.dayOffDays} วัน</td>
                    <td className="px-3 py-3">{r.holidayDays > 0 ? `${r.holidayDays} วัน` : "-"}</td>
                    <td className="px-3 py-3 font-semibold">{r.leaveDaysTotal > 0 ? `${r.leaveDaysTotal} วัน` : "-"}</td>
                    <td className="px-3 py-3">
                      {r.hourlyMinutesTotal > 0 ? (
                        <>
                          {hm(r.hourlyMinutesTotal)}
                          <div className="text-xs text-on-surface-variant">= {r.hourlyDaysTotal} วัน</div>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-3 py-3">{r.otHours > 0 ? `${r.otHours} ชม.` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
