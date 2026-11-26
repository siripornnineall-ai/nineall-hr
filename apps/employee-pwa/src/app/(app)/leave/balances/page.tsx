"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { countsTowardLeaveQuota } from "@/lib/leaveTypes";
import { useT } from "@/lib/i18n";

interface LeaveType {
  id: string;
  name_th: string;
  code: string;
}
interface LeaveBalanceRow {
  leave_type_id: string;
  entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
}

interface UnpaidRow {
  id: string;
  start_date: string;
  end_date: string;
  unit: string;
  start_time: string | null;
  end_time: string | null;
  total_days: number;
  status: string;
  reason: string | null;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const bangkokMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()).slice(0, 7);
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");
const hoursBetween = (a: string | null, b: string | null) => {
  if (!a || !b) return 0;
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - (h1 * 60 + m1)) / 60);
};
const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

export default function LeaveBalancesPage() {
  const { t } = useT();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [month, setMonth] = useState(bangkokMonth());
  const [unpaid, setUnpaid] = useState<UnpaidRow[]>([]);
  const [unpaidLoaded, setUnpaidLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const year = new Date().getFullYear();
    const [{ data: types }, { data: bal }, { data: history }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th, code").eq("org_id", profile.orgId).eq("is_active", true).order("sort_order"),
      supabase
        .from("leave_balances")
        .select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days")
        .eq("employee_id", profile.employeeId)
        .eq("year", year),
      // How often this employee has actually taken each leave type — used purely to order
      // the list below (most-used first), not for the balance numbers themselves.
      supabase.from("leave_requests").select("leave_type_id").eq("employee_id", profile.employeeId).in("status", ["approved", "pending"]),
    ]);

    const usageCount = new Map<string, number>();
    for (const r of history ?? []) usageCount.set(r.leave_type_id, (usageCount.get(r.leave_type_id) ?? 0) + 1);

    // Only quota leave types are shown here — unpaid / WFH / off-site / marriage / childcare
    // are request types, not days an employee "has left".
    const quotaTypeIds = new Set((types ?? []).filter((t) => countsTowardLeaveQuota(t.code)).map((t) => t.id));
    const sortedBalances = [...(bal ?? [])]
      .filter((b) => quotaTypeIds.has(b.leave_type_id))
      .sort((a, b) => (usageCount.get(b.leave_type_id) ?? 0) - (usageCount.get(a.leave_type_id) ?? 0));

    setLeaveTypes(types ?? []);
    setBalances(sortedBalances);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  // Unpaid leave (ลาไม่รับค่าจ้าง) taken in the chosen month — it has no quota, so it is summarised per month instead.
  const unpaidTypeId = leaveTypes.find((lt) => lt.code === "UNPAID")?.id ?? null;
  useEffect(() => {
    if (!profile || !unpaidTypeId) return;
    let cancelled = false;
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, unit, start_time, end_time, total_days, status, reason")
      .eq("employee_id", profile.employeeId)
      .eq("leave_type_id", unpaidTypeId)
      .in("status", ["approved", "pending"])
      .gte("start_date", `${month}-01`)
      .lte("start_date", `${month}-${String(last).padStart(2, "0")}`)
      .order("start_date")
      .then(({ data }) => {
        if (cancelled) return;
        setUnpaid((data ?? []) as UnpaidRow[]);
        setUnpaidLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, supabase, unpaidTypeId, month]);

  const approvedUnpaid = unpaid.filter((r) => r.status === "approved");
  const pendingUnpaid = unpaid.filter((r) => r.status === "pending");
  const sumDays = (rows: UnpaidRow[]) => Math.round(rows.reduce((a, r) => a + Number(r.total_days), 0) * 100) / 100;
  const sumHours = (rows: UnpaidRow[]) => Math.round(rows.reduce((a, r) => a + (r.unit === "full_day" ? 0 : hoursBetween(r.start_time, r.end_time)), 0) * 100) / 100;

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">{t("วันลาคงเหลือ")}</h1>
        <Link href="/leave" className="text-xs font-semibold text-secondary">
          {t("ขอลางาน →")}
        </Link>
      </div>
      <div className="space-y-3">
        {balances.map((b) => {
          const type = leaveTypes.find((t) => t.id === b.leave_type_id);
          const total = Number(b.entitled_days) + Number(b.carried_over_days);
          const used = Number(b.used_days) + Number(b.pending_days);
          const remaining = Math.round((total - used) * 100) / 100;
          const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
          return (
            <div key={b.leave_type_id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-on-surface">{t(type?.name_th ?? "-")}</p>
                <p className="text-sm font-bold text-primary">{remaining} {t("วัน")}</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                <div className="h-full rounded-full bg-primary" style={{ width: `${usedPct}%` }} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-on-surface-variant">
                <span>{t("ใช้ไป")} {Math.round(used * 100) / 100} {t("วัน")}</span>
                <span>{t("ทั้งหมด")} {Math.round(total * 100) / 100} {t("วัน")}</span>
              </div>
            </div>
          );
        })}
        {loaded && balances.length === 0 && <p className="text-sm text-on-surface-variant">{t("ยังไม่มีข้อมูลวันลาคงเหลือ")}</p>}
      </div>
      {/* monthly summary of unpaid leave */}
      <div className="space-y-2 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-on-surface">{t("สรุปลาไม่รับค่าจ้าง")}</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="h-8 w-8 rounded-full border border-outline-variant text-sm font-bold" aria-label={t("เดือนก่อน")}>
              ‹
            </button>
            <span className="min-w-[110px] text-center text-sm font-semibold text-on-surface">
              {THAI_MONTHS[Number(month.slice(5)) - 1]} {Number(month.slice(0, 4)) + 543}
            </span>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="h-8 w-8 rounded-full border border-outline-variant text-sm font-bold" aria-label={t("เดือนถัดไป")}>
              ›
            </button>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-bold text-primary">{sumDays(approvedUnpaid)}</p>
          <p className="text-sm text-on-surface-variant">
            {t("วัน")}
            {sumHours(approvedUnpaid) > 0 && ` · ${sumHours(approvedUnpaid)} ${t("ชั่วโมง")}`}
          </p>
        </div>
        {pendingUnpaid.length > 0 && (
          <p className="text-xs font-semibold text-status-warning">
            {t("รออนุมัติอีก")} {sumDays(pendingUnpaid)} {t("วัน")} ({pendingUnpaid.length} {t("รายการ")})
          </p>
        )}
        <div className="space-y-1.5">
          {unpaidLoaded && unpaid.length === 0 && <p className="text-xs text-on-surface-variant">{t("เดือนนี้ไม่มีการลาไม่รับค่าจ้าง")}</p>}
          {unpaid.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-xl bg-surface-container px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-semibold text-on-surface">
                  {fmtDay(r.start_date)}
                  {r.end_date !== r.start_date && ` – ${fmtDay(r.end_date)}`}
                  {r.unit !== "full_day" && r.start_time && r.end_time && ` · ${hm(r.start_time)}–${hm(r.end_time)}`}
                </p>
                {r.reason && <p className="truncate text-[11px] text-on-surface-variant">{r.reason}</p>}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold text-on-surface">{Number(r.total_days)} {t("วัน")}</p>
                {r.status === "pending" && <p className="text-[11px] font-semibold text-status-warning">{t("รออนุมัติ")}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-on-surface-variant">
        {t("แสดงเฉพาะลาป่วย ลากิจ และลาพักร้อน — ประเภทอื่น (ลาไม่รับค่าจ้าง, WFH, ทำงานนอกสถานที่, ลาแต่งงาน, ลาเพื่อดูแลบุตร, ลาคลอด) ยื่นขอได้ตามปกติจากหน้าขอลางาน")}
      </p>
    </div>
  );
}
