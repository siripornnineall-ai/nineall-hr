import { notFound } from "next/navigation";
import { requireRole, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/Badge";
import { RunActions } from "./RunActions";

const STEPS = [
  { key: "draft", label: "เลือกพนักงาน" },
  { key: "under_review", label: "ตรวจสอบเวลา/ลา" },
  { key: "pending_approval", label: "คำนวณรายได้/หัก" },
  { key: "approved", label: "อนุมัติ" },
  { key: "locked", label: "ล็อก/ออกสลิป" },
];

export default async function PayrollRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const user = await requireUser();
  requireRole(user, ["super_admin", "hr"]);
  const { runId } = await params;
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*, payroll_periods(label, period_start, period_end, pay_date)")
    .eq("id", runId)
    .eq("org_id", user.orgId)
    .maybeSingle();
  if (!run) notFound();

  const { data: calculations } = await supabase
    .from("payroll_employee_calculations")
    .select("*")
    .eq("payroll_run_id", runId)
    .order("employee_code_snapshot");

  const period = run.payroll_periods as unknown as { label: string; period_start: string; period_end: string; pay_date: string } | null;
  const anomalyCount = (calculations ?? []).filter((c) => c.has_anomaly).length;
  const stepIndex = STEPS.findIndex((s) => s.key === run.status);

  return (
    <>
      <Topbar title="การจัดการเงินเดือน" subtitle={period?.label ?? ""} />
      <div className="space-y-6 p-4 md:p-8">
        <div className="flex items-center justify-between rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          {STEPS.map((step, idx) => (
            <div key={step.key} className="flex flex-1 items-center">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    idx <= stepIndex ? "bg-primary text-white" : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {idx + 1}
                </span>
                <span className={`text-sm font-semibold ${idx <= stepIndex ? "text-on-surface" : "text-on-surface-variant opacity-50"}`}>
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && <div className="mx-4 h-px flex-1 bg-outline-variant" />}
            </div>
          ))}
        </div>

        {anomalyCount > 0 && (
          <div className="flex items-center gap-4 rounded-xl bg-error-container p-4 text-on-error-container">
            <span className="material-symbols-outlined text-3xl">warning</span>
            <div className="flex-1">
              <p className="font-bold">ตรวจพบความผิดปกติ!</p>
              <p className="text-sm">มี {anomalyCount} รายการที่ต้องตรวจสอบก่อนส่งอนุมัติ (ดูคอลัมน์หมายเหตุด้านล่าง)</p>
            </div>
          </div>
        )}

        <RunActions runId={runId} status={run.status} canLock={user.role === "super_admin"} />

        <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-surface-container-low">
                <tr>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">รหัส</th>
                  <th className="px-3 py-3 font-bold text-on-surface-variant">ชื่อพนักงาน</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">เงินเดือนพื้นฐาน</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">OT</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">รายได้รวม</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">รายการหัก</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">ประกันสังคม</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">ภาษี</th>
                  <th className="px-3 py-3 text-right font-bold text-on-surface-variant">เงินสุทธิ</th>
                  <th className="px-3 py-3 text-center font-bold text-on-surface-variant">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {(calculations ?? []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-on-surface-variant">
                      ยังไม่มีข้อมูลการคำนวณ กด &quot;คำนวณเงินเดือนอัตโนมัติ&quot; เพื่อเริ่มต้น
                    </td>
                  </tr>
                )}
                {(calculations ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-primary/5">
                    <td className="px-3 py-3">{c.employee_code_snapshot}</td>
                    <td className="px-3 py-3 font-semibold">{c.employee_name_snapshot}</td>
                    <td className="px-3 py-3 text-right">{Number(c.base_amount).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right text-tertiary">{Number(c.ot_amount).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right">{Number(c.gross_earnings).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right text-error">{Number(c.total_deductions).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right">{Number(c.social_security_amount).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right">{Number(c.tax_amount).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-right font-bold text-primary">{Number(c.net_pay).toLocaleString("th-TH")}</td>
                    <td className="px-3 py-3 text-center">
                      {c.has_anomaly ? (
                        <Badge tone="danger">ตรวจสอบ</Badge>
                      ) : (
                        <Badge tone="success">พร้อมจ่าย</Badge>
                      )}
                      {c.anomaly_notes && <p className="mt-1 text-[10px] text-error">{c.anomaly_notes}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
