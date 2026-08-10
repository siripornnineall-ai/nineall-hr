"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface LeaveType {
  id: string;
  name_th: string;
}
interface LeaveBalanceRow {
  leave_type_id: string;
  entitled_days: number;
  carried_over_days: number;
  used_days: number;
  pending_days: number;
}
interface LeaveRequestRow {
  id: string;
  start_date: string;
  end_date: string;
  total_days: number;
  status: string;
  leave_types: { name_th: string } | null;
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function LeavePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
  const [requests, setRequests] = useState<LeaveRequestRow[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const year = new Date().getFullYear();
    const [{ data: types }, { data: bal }, { data: reqs }] = await Promise.all([
      supabase.from("leave_types").select("id, name_th").eq("org_id", profile.orgId).eq("is_active", true),
      supabase
        .from("leave_balances")
        .select("leave_type_id, entitled_days, carried_over_days, used_days, pending_days")
        .eq("employee_id", profile.employeeId)
        .eq("year", year),
      supabase
        .from("leave_requests")
        .select("id, start_date, end_date, total_days, status, leave_types(name_th)")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setLeaveTypes(types ?? []);
    setBalances(bal ?? []);
    setRequests((reqs ?? []) as unknown as LeaveRequestRow[]);
    setSelectedType((current) => current ?? types?.[0]?.id ?? null);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function computeDays(): number {
    if (!startDate || !endDate) return 0;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    const totalDays = computeDays();
    if (!selectedType || !startDate || !endDate || totalDays <= 0 || !reason) {
      setError("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("leave_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      leave_type_id: selectedType,
      start_date: startDate,
      end_date: endDate,
      unit: "full_day",
      total_days: totalDays,
      reason,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message.includes("INSUFFICIENT_LEAVE_BALANCE") ? "วันลาคงเหลือไม่เพียงพอ" : insertError.message);
      return;
    }
    setStartDate("");
    setEndDate("");
    setReason("");
    setSuccess("ส่งคำขอลาเรียบร้อยแล้ว");
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ขอลางาน</h1>

      <div className="grid grid-cols-2 gap-3">
        {balances.slice(0, 2).map((b) => {
          const type = leaveTypes.find((t) => t.id === b.leave_type_id);
          const remaining = Number(b.entitled_days) + Number(b.carried_over_days) - Number(b.used_days) - Number(b.pending_days);
          return (
            <div key={b.leave_type_id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <p className="text-xs text-on-surface-variant">{type?.name_th ?? "-"}</p>
              <p className="mt-1 text-xl font-bold text-primary">{remaining} วัน</p>
            </div>
          );
        })}
        {balances.length === 0 && <p className="col-span-2 text-sm text-on-surface-variant">ยังไม่มีข้อมูลวันลาคงเหลือ</p>}
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">ประเภทการลา</label>
          <div className="flex flex-wrap gap-2">
            {leaveTypes.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={clsx(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  selectedType === t.id ? "border-primary bg-primary text-white font-bold" : "border-outline-variant text-on-surface-variant"
                )}
              >
                {t.name_th}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันที่เริ่ม</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันที่สิ้นสุด</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เหตุผล</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="ระบุเหตุผลการลา"
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-surface-container p-3.5">
          <span className="text-sm font-semibold">ลารวมทั้งหมด:</span>
          <span className="font-bold text-primary">{computeDays()} วัน</span>
        </div>

        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60"
        >
          {submitting ? "กำลังส่ง..." : "ส่งคำขอลา"}
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-on-surface">ประวัติคำขอ</h2>
        {requests.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีคำขอลา</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">{r.leave_types?.name_th ?? "-"}</p>
                <p className="text-xs text-on-surface-variant">
                  {r.start_date} - {r.end_date} ({r.total_days} วัน)
                </p>
              </div>
              <span className={clsx("text-xs font-bold", STATUS_CLASS[r.status])}>{STATUS_TH[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
