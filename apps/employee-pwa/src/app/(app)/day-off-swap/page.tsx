"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface DayOffOption {
  work_date: string;
}

interface SwapRow {
  id: string;
  original_date: string;
  substitute_date: string;
  reason: string | null;
  status: string;
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function DayOffSwapPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [dayOffOptions, setDayOffOptions] = useState<DayOffOption[]>([]);
  const [requests, setRequests] = useState<SwapRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [originalDate, setOriginalDate] = useState("");
  const [substituteDate, setSubstituteDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: offDays }, { data: swaps }] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("work_date")
        .eq("employee_id", profile.employeeId)
        .eq("is_day_off", true)
        .gte("work_date", today)
        .order("work_date")
        .limit(30),
      supabase
        .from("day_off_swap_requests")
        .select("id, original_date, substitute_date, reason, status")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setDayOffOptions(offDays ?? []);
    setRequests(swaps ?? []);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!originalDate) {
      setError("กรุณาเลือกวันหยุดที่จะสลับ");
      return;
    }
    if (!substituteDate) {
      setError("กรุณาเลือกวันที่จะหยุดแทน");
      return;
    }
    if (originalDate === substituteDate) {
      setError("วันหยุดเดิมและวันหยุดใหม่ต้องไม่ใช่วันเดียวกัน");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("day_off_swap_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      original_date: originalDate,
      substitute_date: substituteDate,
      reason: reason || null,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOriginalDate("");
    setSubstituteDate("");
    setReason("");
    setSuccess("ส่งคำขอสลับวันหยุดเรียบร้อยแล้ว รอ HR อนุมัติ");
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">สลับวันหยุดประจำ</h1>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold text-on-surface-variant">สำหรับสลับวันหยุดปกติของคุณ เช่น ปกติหยุดเสาร์-อาทิตย์ อยากสลับไปหยุดวันอื่นแทน</p>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันหยุดเดิมที่จะสลับ (ทำงานแทน)</label>
          <select
            value={originalDate}
            onChange={(e) => setOriginalDate(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          >
            <option value="">-- เลือกวันหยุด --</option>
            {dayOffOptions.map((d) => (
              <option key={d.work_date} value={d.work_date}>
                {new Date(d.work_date).toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
              </option>
            ))}
          </select>
          {dayOffOptions.length === 0 && loaded && <p className="mt-1 text-xs text-on-surface-variant">ไม่พบวันหยุดที่กำหนดไว้ล่วงหน้าในตารางกะของคุณ</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันที่ขอหยุดแทน</label>
          <input
            type="date"
            value={substituteDate}
            onChange={(e) => setSubstituteDate(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เหตุผล (ไม่บังคับ)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
          {submitting ? "กำลังส่ง..." : "ส่งคำขอ"}
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-on-surface">ประวัติคำขอ</h2>
        {loaded && requests.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีคำขอสลับวันหยุด</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">
                  ทำงาน {new Date(r.original_date).toLocaleDateString("th-TH")} → หยุด {new Date(r.substitute_date).toLocaleDateString("th-TH")}
                </p>
                {r.reason && <p className="text-xs text-on-surface-variant">{r.reason}</p>}
              </div>
              <span className={clsx("text-xs font-bold", STATUS_CLASS[r.status])}>{STATUS_TH[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
