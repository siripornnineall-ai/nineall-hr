import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { signAvatarUrls } from "@/lib/avatars";
import { DayOffSwapRow } from "./DayOffSwapRow";

export default async function DayOffSwapPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("day_off_swap_requests")
    .select(
      "id, original_date, substitute_date, unit, period, reason, status, employees!day_off_swap_requests_employee_id_fkey(employee_code, first_name, last_name, photo_url)"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const signedByPath = await signAvatarUrls(
    supabase,
    (data ?? []).map((r) => (r.employees as unknown as { photo_url: string | null } | null)?.photo_url)
  );

  const rows = (data ?? []).map((r) => {
    const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; photo_url: string | null } | null;
    return {
      id: r.id,
      employeeCode: emp?.employee_code ?? "-",
      employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
      employeePhotoUrl: emp?.photo_url ? (signedByPath.get(emp.photo_url) ?? null) : null,
      originalDate: r.original_date,
      substituteDate: r.substitute_date,
      unit: r.unit,
      period: r.period,
      reason: r.reason,
      status: r.status,
    };
  });

  return (
    <>
      <Topbar title="สลับวันหยุดประจำ" subtitle="คำขอสลับวันหยุดประจำ (ไม่ใช่วันหยุดนักขัตฤกษ์) ทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-4 py-3 font-bold text-on-surface-variant">พนักงาน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันหยุดเดิมที่ทำงานแทน</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">วันหยุดใหม่</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">เหตุผล</th>
                  <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีคำขอสลับวันหยุดประจำ
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <DayOffSwapRow key={r.id} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
