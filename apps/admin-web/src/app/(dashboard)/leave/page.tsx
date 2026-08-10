import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { ApproveRejectButtons } from "./ApproveRejectButtons";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

export default async function LeavePage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("leave_requests")
    .select(
      "id, start_date, end_date, total_days, unit, status, reason, created_at, employees(employee_code, first_name, last_name), leave_types(name_th)"
    )
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  const requests = data ?? [];

  return (
    <>
      <Topbar title="การลา" subtitle="คำขอลาทั้งหมด" />
      <div className="space-y-4 p-4 md:p-8">
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
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีคำขอลา
                    </td>
                  </tr>
                )}
                {requests.map((r, idx) => {
                  const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
                  const leaveType = r.leave_types as unknown as { name_th: string } | null;
                  const badge = STATUS_BADGE[r.status] ?? { tone: "neutral" as const, label: r.status };
                  return (
                    <tr key={r.id} className={idx % 2 === 1 ? "bg-row-zebra" : ""}>
                      <td className="px-4 py-3 font-semibold">
                        {emp ? `${emp.first_name} ${emp.last_name}` : "-"}
                        <div className="text-xs text-on-surface-variant">{emp?.employee_code}</div>
                      </td>
                      <td className="px-4 py-3">{leaveType?.name_th ?? "-"}</td>
                      <td className="px-4 py-3">
                        {new Date(r.start_date).toLocaleDateString("th-TH")} - {new Date(r.end_date).toLocaleDateString("th-TH")}
                      </td>
                      <td className="px-4 py-3">{r.total_days} วัน</td>
                      <td className="max-w-[220px] truncate px-4 py-3" title={r.reason ?? ""}>
                        {r.reason ?? "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3">{r.status === "pending" && <ApproveRejectButtons requestId={r.id} />}</td>
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
