import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

export default async function ReportsPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("attendance_records")
    .select("status, employees(employee_code, first_name, last_name)")
    .eq("org_id", user.orgId)
    .gte("work_date", monthStartStr);

  const summary = new Map<string, { name: string; onTime: number; late: number; absent: number; leave: number }>();
  for (const row of data ?? []) {
    const emp = row.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
    if (!emp) continue;
    const key = emp.employee_code;
    if (!summary.has(key)) summary.set(key, { name: `${emp.first_name} ${emp.last_name}`, onTime: 0, late: 0, absent: 0, leave: 0 });
    const s = summary.get(key)!;
    if (row.status === "on_time") s.onTime++;
    else if (row.status === "late") s.late++;
    else if (row.status === "absent") s.absent++;
    else if (row.status === "leave") s.leave++;
  }

  return (
    <>
      <Topbar title="รายงาน" subtitle="สรุปการมาทำงานเดือนนี้" />
      <div className="space-y-6 p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-4 py-3 font-bold text-on-surface-variant">รหัส</th>
                <th className="px-4 py-3 font-bold text-on-surface-variant">ชื่อ</th>
                <th className="px-4 py-3 text-right font-bold text-on-surface-variant">ตรงเวลา</th>
                <th className="px-4 py-3 text-right font-bold text-on-surface-variant">มาสาย</th>
                <th className="px-4 py-3 text-right font-bold text-on-surface-variant">ขาดงาน</th>
                <th className="px-4 py-3 text-right font-bold text-on-surface-variant">ลา</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {summary.size === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                    ยังไม่มีข้อมูลเดือนนี้
                  </td>
                </tr>
              )}
              {Array.from(summary.entries()).map(([code, s]) => (
                <tr key={code}>
                  <td className="px-4 py-3">{code}</td>
                  <td className="px-4 py-3 font-semibold">{s.name}</td>
                  <td className="px-4 py-3 text-right">{s.onTime}</td>
                  <td className="px-4 py-3 text-right">{s.late}</td>
                  <td className="px-4 py-3 text-right">{s.absent}</td>
                  <td className="px-4 py-3 text-right">{s.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-4 text-sm text-on-surface-variant">
          รายงานเพิ่มเติม (เงินเดือน, ประกันสังคม, ภาษี, ค่าใช้จ่ายแยกแผนก, Export Excel/CSV/PDF) อยู่ระหว่างพัฒนา — ดู
          <code> IMPLEMENTATION_STATUS.md</code>
        </p>
      </div>
    </>
  );
}
