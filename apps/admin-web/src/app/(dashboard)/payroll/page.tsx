import Link from "next/link";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { createPayrollRunAction } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  under_review: { tone: "info", label: "Under Review" },
  pending_approval: { tone: "warning", label: "Pending Approval" },
  approved: { tone: "success", label: "Approved" },
  paid: { tone: "success", label: "Paid" },
  locked: { tone: "neutral", label: "Locked" },
};

export default async function PayrollPage() {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const supabase = await createClient();

  const { data: runs } = await supabase
    .from("payroll_runs")
    .select("id, status, employee_count, total_net_amount, created_at, payroll_periods(label, period_start, period_end)")
    .eq("org_id", user.orgId)
    .order("created_at", { ascending: false });

  return (
    <>
      <Topbar title="การจัดการเงินเดือน" subtitle="สร้างและตรวจสอบรอบเงินเดือน" />
      <div className="space-y-6 p-4 md:p-8">
        <form action={createPayrollRunAction} className="flex flex-wrap items-end gap-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อรอบ</label>
            <input name="label" placeholder="เช่น สิงหาคม 2569" className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันเริ่มรอบ</label>
            <input name="periodStart" type="date" required className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันสิ้นสุดรอบ</label>
            <input name="periodEnd" type="date" required className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันจ่ายเงิน</label>
            <input name="payDate" type="date" required className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
          </div>
          <button type="submit" className="h-10 rounded-lg bg-primary px-6 text-sm font-bold text-white">
            สร้างรอบเงินเดือนใหม่
          </button>
        </form>

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container">
                <th className="px-4 py-3 font-bold text-on-surface-variant">รอบเงินเดือน</th>
                <th className="px-4 py-3 font-bold text-on-surface-variant">จำนวนพนักงาน</th>
                <th className="px-4 py-3 font-bold text-on-surface-variant">ยอดสุทธิรวม</th>
                <th className="px-4 py-3 font-bold text-on-surface-variant">สถานะ</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {(runs ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-on-surface-variant">
                    ยังไม่มีรอบเงินเดือน
                  </td>
                </tr>
              )}
              {(runs ?? []).map((r) => {
                const period = r.payroll_periods as unknown as { label: string; period_start: string; period_end: string } | null;
                const badge = STATUS_BADGE[r.status] ?? { tone: "neutral" as const, label: r.status };
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-3 font-semibold">
                      <Link href={`/payroll/${r.id}`} className="hover:text-primary hover:underline">
                        {period?.label ?? "-"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.employee_count}</td>
                    <td className="px-4 py-3">{Number(r.total_net_amount).toLocaleString("th-TH")} บาท</td>
                    <td className="px-4 py-3">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/payroll/${r.id}`} className="text-xs font-bold text-primary">
                        ดูรายละเอียด
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
