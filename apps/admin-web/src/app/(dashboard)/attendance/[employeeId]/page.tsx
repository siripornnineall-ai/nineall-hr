import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { AddBackdatedAttendanceForm } from "./AddBackdatedAttendanceForm";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "info" | "holiday" | "neutral"; label: string }> = {
  on_time: { tone: "success", label: "ตรงเวลา" },
  late: { tone: "warning", label: "มาสาย" },
  early_leave: { tone: "warning", label: "ออกก่อน" },
  absent: { tone: "danger", label: "ขาดงาน" },
  holiday: { tone: "holiday", label: "วันหยุด" },
  leave: { tone: "info", label: "ลา" },
  work_from_home: { tone: "info", label: "WFH" },
  off_site: { tone: "info", label: "นอกสถานที่" },
  pending_offline: { tone: "neutral", label: "รอซิงค์" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

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
    .select("id, employee_code, first_name, last_name, photo_url, job_positions(title), departments(name)")
    .eq("org_id", user.orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (!employee) notFound();

  let photoUrl: string | null = null;
  if (employee.photo_url) {
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(employee.photo_url, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }
  const position = (employee.job_positions as unknown as { title: string } | null)?.title ?? null;
  const department = (employee.departments as unknown as { name: string } | null)?.name ?? null;

  const { data: records } = await supabase
    .from("attendance_records")
    .select("work_date, status, clock_in_server_at, clock_out_server_at, late_minutes, ot_minutes")
    .eq("org_id", user.orgId)
    .eq("employee_id", employeeId)
    .gte("work_date", monthStart)
    .lte("work_date", monthEnd)
    .order("work_date", { ascending: false });

  const { data: shifts } = await supabase.from("work_shifts").select("id, name").eq("org_id", user.orgId).order("name");
  const { data: workLocations } = await supabase.from("work_locations").select("id, name").eq("org_id", user.orgId).order("name");

  const rows = records ?? [];
  const count = (statuses: string[]) => rows.filter((r) => statuses.includes(r.status)).length;
  const workedDays = count(["on_time", "late", "work_from_home", "off_site", "early_leave"]);
  const lateDays = count(["late"]);
  const leaveDays = count(["leave"]);
  const absentDays = count(["absent"]);
  const holidayDays = count(["holiday"]);
  const totalLateMinutes = rows.reduce((sum, r) => sum + (r.late_minutes ?? 0), 0);
  const totalOtHours = rows.reduce((sum, r) => sum + (r.ot_minutes ?? 0), 0) / 60;

  const monthLabel = new Date(Date.UTC(year, monthIndex, 1)).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <Topbar title={`${employee.first_name} ${employee.last_name}`} subtitle={`${employee.employee_code} • ${position ?? "-"} • ${department ?? "-"}`} />
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

        <AddBackdatedAttendanceForm employeeId={employee.id} shifts={shifts ?? []} workLocations={workLocations ?? []} />

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
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีข้อมูลการลงเวลาในเดือนนี้
                    </td>
                  </tr>
                )}
                {rows.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? { tone: "neutral" as const, label: r.status };
                  return (
                    <tr key={r.work_date}>
                      <td className="px-4 py-3">{new Date(r.work_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td className="px-4 py-3">{formatTime(r.clock_in_server_at)}</td>
                      <td className="px-4 py-3">{formatTime(r.clock_out_server_at)}</td>
                      <td className="px-4 py-3">{r.late_minutes || "-"}</td>
                      <td className="px-4 py-3">{r.ot_minutes || "-"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
