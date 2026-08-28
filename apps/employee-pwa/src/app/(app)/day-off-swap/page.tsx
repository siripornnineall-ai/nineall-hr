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
  unit: string;
  period: string | null;
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

function UnitChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-primary bg-primary text-white font-bold" : "border-outline-variant text-on-surface-variant"
      )}
    >
      {label}
    </button>
  );
}

export default function DayOffSwapPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [dayOffOptions, setDayOffOptions] = useState<DayOffOption[]>([]);
  const [requests, setRequests] = useState<SwapRow[]>([]);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const [originalDate, setOriginalDate] = useState("");
  const [substituteDate, setSubstituteDate] = useState("");
  const [unit, setUnit] = useState<"full_day" | "half_day">("full_day");
  const [period, setPeriod] = useState<"morning" | "afternoon">("morning");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    // Includes past days off too, not just upcoming — an employee who worked through
    // their normal day off sometimes only asks for the swap afterwards, same as the
    // holiday-swap request form.
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const [{ data: offDays }, { data: swaps }, { data: holidays }] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("work_date")
        .eq("employee_id", profile.employeeId)
        .eq("is_day_off", true)
        .gte("work_date", sixtyDaysAgo)
        // Ascending, not descending: a recurring weekly day-off (e.g. every Sat/Sun) can
        // easily have 100+ rows stretching a year forward (shift_assignments are generated
        // that far out — see ShiftAssignment.tsx), so a descending order capped at 60 kept
        // only the farthest-future dates and silently dropped every near-term one.
        .order("work_date", { ascending: true })
        .limit(60),
      supabase
        .from("day_off_swap_requests")
        .select("id, original_date, substitute_date, unit, period, reason, status")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("company_holidays").select("holiday_date").eq("org_id", profile.orgId),
    ]);
    setDayOffOptions(offDays ?? []);
    setRequests(swaps ?? []);
    setHolidayDates(new Set((holidays ?? []).map((h) => h.holiday_date)));
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
    if (holidayDates.has(substituteDate)) {
      setError("วันที่เลือกเป็นวันหยุดนักขัตฤกษ์ กรุณาเลือกวันอื่น หรือใช้หน้าสลับวันหยุดนักขัตฤกษ์แทน");
      return;
    }
    const activeRequests = requests.filter((r) => r.status === "pending" || r.status === "approved");
    const dateInUse = activeRequests.some(
      (r) => r.original_date === originalDate || r.original_date === substituteDate || r.substitute_date === originalDate || r.substitute_date === substituteDate
    );
    if (dateInUse) {
      setError("วันที่เลือกมีคำขอสลับวันหยุดอื่นที่รออนุมัติ/อนุมัติแล้วอยู่ กรุณาเลือกวันอื่น");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("day_off_swap_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      original_date: originalDate,
      substitute_date: substituteDate,
      unit,
      period: unit === "half_day" ? period : null,
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
    setUnit("full_day");
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
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">จำนวนที่จะทำงาน</label>
          <div className="flex flex-wrap gap-2">
            <UnitChip label="เต็มวัน" active={unit === "full_day"} onClick={() => setUnit("full_day")} />
            <UnitChip label="ครึ่งวัน" active={unit === "half_day"} onClick={() => setUnit("half_day")} />
          </div>
          <p className="mt-1 text-xs text-on-surface-variant">
            {unit === "full_day" ? "ทำงานเต็มวันหยุดเดิม แลกกับวันหยุดใหม่เต็มวัน" : "ทำงานครึ่งวันหยุดเดิม แลกกับหยุดช่วงเดียวกันในวันที่เลือก"}
          </p>
        </div>
        {unit === "half_day" && (
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">ช่วงที่จะทำงาน (วันหยุดเดิม)</label>
            <div className="flex gap-2">
              <UnitChip label="เช้า" active={period === "morning"} onClick={() => setPeriod("morning")} />
              <UnitChip label="บ่าย" active={period === "afternoon"} onClick={() => setPeriod("afternoon")} />
            </div>
          </div>
        )}
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
                  ทำงาน {new Date(r.original_date).toLocaleDateString("th-TH")}
                  {r.unit === "half_day" && ` (${r.period === "morning" ? "เช้า" : "บ่าย"})`} → หยุด {new Date(r.substitute_date).toLocaleDateString("th-TH")}
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
