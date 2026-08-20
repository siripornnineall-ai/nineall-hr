import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { ShiftSwapRow } from "./ShiftSwapRow";

export default async function ShiftSwapPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("shift_swap_requests")
    .select(
      "id, reason, status, created_at, requester:employees!shift_swap_requests_requester_employee_id_fkey(employee_code, first_name, last_name), target:employees!shift_swap_requests_target_employee_id_fkey(first_name, last_name), shift_assignments!shift_swap_requests_original_assignment_id_fkey(work_date, work_shifts(name))"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []).map((r) => {
    const requester = r.requester as unknown as { employee_code: string; first_name: string; last_name: string } | null;
    const target = r.target as unknown as { first_name: string; last_name: string } | null;
    const assignment = r.shift_assignments as unknown as { work_date: string; work_shifts: { name: string } | null } | null;
    return {
      id: r.id,
      requesterName: requester ? `${requester.first_name} ${requester.last_name}` : "-",
      requesterCode: requester?.employee_code ?? "-",
      targetName: target ? `${target.first_name} ${target.last_name}` : null,
      workDate: assignment?.work_date ?? null,
      shiftName: assignment?.work_shifts?.name ?? null,
      reason: r.reason,
      status: r.status,
    };
  });

  return (
    <>
      <Topbar title="สลับ/แก้กะทำงาน" subtitle="คำขอสลับ/แก้กะทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันที่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">กะเดิม</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สลับกับ</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เหตุผล</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีคำขอสลับ/แก้กะ
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <ShiftSwapRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
