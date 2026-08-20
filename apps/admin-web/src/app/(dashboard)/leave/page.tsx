import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { LeaveRow } from "./LeaveRow";
import { AddBackdatedLeaveForm } from "./AddBackdatedLeaveForm";

export default async function LeavePage() {
  const user = await requireUser();
  const supabase = await createClient();

  // employees must be disambiguated: leave_requests has two FKs to employees
  // (employee_id and delegate_employee_id), so a bare `employees(...)` embed is
  // ambiguous to PostgREST and errors out silently (same bug as employees/[id]'s
  // teams embed — see that page's comment).
  const [{ data }, { data: leaveTypes }, { data: employees }] = await Promise.all([
    supabase
      .from("leave_requests")
      .select(
        "id, start_date, end_date, total_days, unit, status, reason, created_at, leave_type_id, employees!leave_requests_employee_id_fkey(employee_code, first_name, last_name), leave_types(name_th)"
      )
      .eq("org_id", user.orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("leave_types").select("id, name_th").eq("org_id", user.orgId).eq("is_active", true).order("sort_order"),
    supabase
      .from("employees")
      .select("id, employee_code, first_name, last_name")
      .eq("org_id", user.orgId)
      .in("employment_status", ["active", "probation"])
      .order("employee_code"),
  ]);

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
    const leaveType = r.leave_types as unknown as { name_th: string } | null;
    return {
      id: r.id,
      leaveTypeId: r.leave_type_id,
      leaveTypeName: leaveType?.name_th ?? "-",
      startDate: r.start_date,
      endDate: r.end_date,
      totalDays: Number(r.total_days),
      status: r.status,
      reason: r.reason,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
    };
  });

  return (
    <>
      <Topbar title="การลา" subtitle="คำขอลาทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <AddBackdatedLeaveForm employees={employees ?? []} leaveTypes={leaveTypes ?? []} />
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">ประเภทลา</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">จำนวนวัน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เหตุผล</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีคำขอลา
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <LeaveRow key={r.id} row={r} leaveTypes={leaveTypes ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
