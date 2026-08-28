import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { getOtCutoffWindow, currentOtCutoffMonthKey, shiftOtCutoffMonthKey } from "@/lib/otCutoff";
import { OtRow } from "./OtRow";
import { AddBackdatedOvertimeForm } from "./AddBackdatedOvertimeForm";

function parseMonthKey(month: string | undefined): string {
  return month && /^\d{4}-\d{2}$/.test(month) ? month : currentOtCutoffMonthKey();
}

function formatCutoffLabel(monthKey: string): string {
  const { start, end } = getOtCutoffWindow(monthKey);
  const fmt = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function OvertimePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { month: monthParam } = await searchParams;
  const supabase = await createClient();

  const monthKey = parseMonthKey(monthParam);
  const { start, end } = getOtCutoffWindow(monthKey);
  const prevMonthKey = shiftOtCutoffMonthKey(monthKey, -1);
  const nextMonthKey = shiftOtCutoffMonthKey(monthKey, 1);

  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_code, first_name, last_name")
    .eq("org_id", user.orgId)
    .is("deleted_at", null)
    .in("employment_status", ["active", "probation"])
    .order("employee_code");

  const { data } = await supabase
    .from("overtime_requests")
    .select(
      "id, work_date, start_time, end_time, requested_hours, approved_hours, rate_multiplier, status, reason, task_description, employees(employee_code, first_name, last_name, photo_url)"
    )
    .eq("org_id", user.orgId)
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: false });

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    return {
      id: r.id,
      workDate: r.work_date,
      startTime: r.start_time,
      endTime: r.end_time,
      requestedHours: Number(r.requested_hours),
      approvedHours: r.approved_hours != null ? Number(r.approved_hours) : null,
      rateMultiplier: Number(r.rate_multiplier),
      status: r.status,
      taskDescription: r.task_description,
      reason: r.reason,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
    };
  });

  // Only approved hours are what payroll actually pays out — pending/rejected requests
  // aren't real hours yet, so they're excluded from the total but still shown in the
  // detail list below and called out separately as "pending" so nothing is hidden.
  const totalsByEmployee = new Map<string, { employeeCode: string; employeeName: string; employeePhotoUrl: string | null; approvedHours: number; pendingCount: number }>();
  for (const r of rows) {
    const key = r.employeeCode;
    const existing = totalsByEmployee.get(key) ?? { employeeCode: r.employeeCode, employeeName: r.employeeName, employeePhotoUrl: r.employeePhotoUrl, approvedHours: 0, pendingCount: 0 };
    if (r.status === "approved") existing.approvedHours += r.approvedHours ?? r.requestedHours;
    if (r.status === "pending") existing.pendingCount += 1;
    totalsByEmployee.set(key, existing);
  }
  const totals = Array.from(totalsByEmployee.values()).sort((a, b) => b.approvedHours - a.approvedHours);
  const grandTotal = totals.reduce((sum, t) => sum + t.approvedHours, 0);

  return (
    <>
      <Topbar title="ล่วงเวลา (OT)" subtitle="คำขอ OT ทั้งหมด — ตัดรอบทุกวันที่ 25" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-on-surface-variant">รอบ: {formatCutoffLabel(monthKey)}</p>
          <div className="flex items-center gap-2">
            <Link href={`?month=${prevMonthKey}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              ← รอบก่อน
            </Link>
            <Link href={`?month=${nextMonthKey}`} className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold hover:bg-surface-variant/20">
              รอบถัดไป →
            </Link>
          </div>
        </div>

        <AddBackdatedOvertimeForm employees={employees ?? []} />

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container px-4 py-3">
            <p className="text-sm font-bold text-on-surface">สรุปยอด OT ต่อคน (เฉพาะที่อนุมัติแล้ว)</p>
            <p className="text-sm font-bold text-primary">รวมทั้งหมด {grandTotal} ชม.</p>
          </div>
          {totals.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-on-surface-variant">ไม่มี OT ที่อนุมัติแล้วในรอบนี้</p>
          ) : (
            <div className="divide-y divide-outline-variant">
              {totals.map((t) => (
                <div key={t.employeeCode} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div>
                    <span className="font-semibold text-on-surface">{t.employeeName}</span>
                    <span className="ml-2 text-xs text-on-surface-variant">{t.employeeCode}</span>
                    {t.pendingCount > 0 && <span className="ml-2 text-xs font-semibold text-status-warning">(รออนุมัติอีก {t.pendingCount} รายการ)</span>}
                  </div>
                  <span className="font-bold text-on-surface">{t.approvedHours} ชม.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เวลา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ชั่วโมง</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">อัตรา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ไม่มีคำขอ OT ในรอบนี้
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <OtRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
