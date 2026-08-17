"use client";

import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface PayslipRow {
  id: string;
  pdf_file_path: string | null;
  payroll_periods: { label: string; pay_date: string } | null;
  payroll_employee_calculations: {
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
    social_security_amount: number;
    tax_amount: number;
  } | null;
}

export default function PayslipPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [payslips, setPayslips] = useState<PayslipRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function handleDownload(path: string, id: string) {
    setDownloadingId(id);
    const { data } = await supabase.storage.from("payslips").createSignedUrl(path, 3600);
    setDownloadingId(null);
    if (data) window.open(data.signedUrl, "_blank");
  }

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("payslips")
      .select(
        "id, pdf_file_path, payroll_periods(label, pay_date), payroll_employee_calculations(gross_earnings, total_deductions, net_pay, social_security_amount, tax_amount)"
      )
      .eq("employee_id", profile.employeeId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setPayslips((data ?? []) as unknown as PayslipRow[]);
        setLoaded(true);
      });
  }, [profile, supabase]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">สลิปเงินเดือน</h1>

      {loaded && payslips.length === 0 && (
        <p className="py-10 text-center text-sm text-on-surface-variant">ยังไม่มีสลิปเงินเดือน</p>
      )}

      {payslips.map((p) => {
        const calc = p.payroll_employee_calculations;
        const period = p.payroll_periods;
        const expanded = expandedId === p.id;
        return (
          <div key={p.id} className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <button onClick={() => setExpandedId(expanded ? null : p.id)} className="flex w-full items-center justify-between p-4 text-left">
              <div>
                <p className="font-semibold text-on-surface">{period?.label ?? "-"}</p>
                <p className="text-xs text-on-surface-variant">จ่ายวันที่ {period?.pay_date}</p>
              </div>
              <p className="text-base font-bold text-primary">{calc ? Number(calc.net_pay).toLocaleString("th-TH") : "-"} บาท</p>
            </button>

            {expanded && calc && (
              <div className="space-y-1.5 px-4 pb-4">
                <DetailRow label="รายได้รวม" value={calc.gross_earnings} />
                <DetailRow label="รายการหักรวม" value={-calc.total_deductions} negative />
                <DetailRow label="ประกันสังคม" value={-calc.social_security_amount} negative />
                <DetailRow label="ภาษีหัก ณ ที่จ่าย" value={-calc.tax_amount} negative />
                <div className="my-1 h-px bg-outline-variant" />
                <DetailRow label="เงินได้สุทธิ" value={calc.net_pay} bold />
                {p.pdf_file_path && (
                  <button
                    onClick={() => handleDownload(p.pdf_file_path!, p.id)}
                    disabled={downloadingId === p.id}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[18px]">{downloadingId === p.id ? "progress_activity" : "download"}</span>
                    {downloadingId === p.id ? "กำลังเตรียมไฟล์..." : "ดาวน์โหลด PDF"}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailRow({ label, value, negative, bold }: { label: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={clsx(bold && "font-bold")}>{label}</span>
      <span className={clsx(negative && "text-status-danger", bold && "font-bold text-primary")}>{value.toLocaleString("th-TH")}</span>
    </div>
  );
}
