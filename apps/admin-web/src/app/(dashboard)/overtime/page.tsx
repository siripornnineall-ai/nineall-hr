import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { OtRow } from "./OtRow";

export default async function OvertimePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("overtime_requests")
    .select("id, work_date, start_time, end_time, requested_hours, rate_multiplier, status, reason, task_description, employees(employee_code, first_name, last_name)")
    .eq("org_id", user.orgId)
    .order("work_date", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
    return {
      id: r.id,
      workDate: r.work_date,
      startTime: r.start_time,
      endTime: r.end_time,
      requestedHours: Number(r.requested_hours),
      rateMultiplier: Number(r.rate_multiplier),
      status: r.status,
      taskDescription: r.task_description,
      reason: r.reason,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
    };
  });

  return (
    <>
      <Topbar title="ล่วงเวลา (OT)" subtitle="คำขอ OT ทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
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
                      ยังไม่มีคำขอ OT
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
