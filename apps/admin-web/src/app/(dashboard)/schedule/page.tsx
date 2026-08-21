import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { WeeklyScheduleRow } from "./WeeklyScheduleRow";

export default async function SchedulePage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 6);

  const [{ data: employees }, { data: shifts }, { data: upcoming }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name, photo_url")
      .eq("org_id", user.orgId)
      .is("deleted_at", null)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
    supabase.from("work_shifts").select("id, name, start_time, end_time").eq("org_id", user.orgId),
    supabase
      .from("shift_assignments")
      .select("employee_id, work_date, shift_id")
      .eq("org_id", user.orgId)
      .gte("work_date", today.toISOString().slice(0, 10))
      .lte("work_date", weekAhead.toISOString().slice(0, 10)),
  ]);

  const signedByPath = await signAvatarUrls(supabase, (employees ?? []).map((e) => e.photo_url));

  // Infer each employee's current pattern from whatever's already assigned in the next
  // 7 days (one occurrence of every weekday) so the editor opens pre-filled instead of
  // blank — there's no separate "recurring template" row, shift_assignments is the only
  // source of truth.
  const patternByEmployee = new Map<string, Record<number, string>>();
  for (const row of upcoming ?? []) {
    const dayOfWeek = new Date(row.work_date).getUTCDay();
    const existing = patternByEmployee.get(row.employee_id) ?? {};
    existing[dayOfWeek] = row.shift_id ?? "";
    patternByEmployee.set(row.employee_id, existing);
  }

  return (
    <>
      <Topbar title="ตารางกะประจำสัปดาห์" subtitle="กำหนดวันทำงาน/วันหยุดของพนักงานแต่ละคนล่วงหน้า 180 วัน" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">จ.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">อ.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">พ.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">พฤ.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">ศ.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">ส.</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">อา.</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {(employees ?? []).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีข้อมูลพนักงาน
                    </td>
                  </tr>
                )}
                {(employees ?? []).map((e) => (
                  <WeeklyScheduleRow
                    key={e.id}
                    employeeId={e.id}
                    employeeCode={e.employee_code}
                    employeeName={`${e.first_name} ${e.last_name}`}
                    photoUrl={e.photo_url ? (signedByPath.get(e.photo_url) ?? null) : null}
                    shifts={shifts ?? []}
                    initialPattern={patternByEmployee.get(e.id) ?? {}}
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
