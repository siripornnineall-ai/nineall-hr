"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { currentOtCutoffMonthKey, getOtCutoffWindow } from "@/lib/otCutoff";

interface OvertimeRow {
  id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  requested_hours: number;
  approved_hours: number | null;
  rate_multiplier: number;
  status: string;
}

// Mirrors the org's currently configured policy_settings.ot_rate (normal/holiday
// multipliers). Regular employees can't read policy_settings directly (admin/HR
// only via RLS), so this is a best-effort default rather than a live lookup.
const OT_RATE = { normal: 1, holiday: 1 };

// HR caps how far back an OT request can be backdated — mirrored server-side by the
// overtime_requests_insert RLS policy, which is the real enforcement (see migration
// 0049); this is just so the employee gets an immediate, friendly message instead of a
// raw "row-level security policy" error from the database.
const MAX_BACKDATE_DAYS = 3;

function earliestAllowedOtDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - MAX_BACKDATE_DAYS);
  return d.toISOString().slice(0, 10);
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function OvertimePage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<OvertimeRow[]>([]);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [historyYear, setHistoryYear] = useState(() => new Date().getFullYear());

  const [workDate, setWorkDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [taskDescription, setTaskDescription] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [{ data: reqs }, { data: holidays }] = await Promise.all([
      supabase
        .from("overtime_requests")
        .select("id, work_date, start_time, end_time, requested_hours, approved_hours, rate_multiplier, status")
        .eq("employee_id", profile.employeeId)
        .gte("work_date", `${historyYear}-01-01`)
        .lte("work_date", `${historyYear}-12-31`)
        .order("work_date", { ascending: false }),
      supabase.from("company_holidays").select("holiday_date").eq("org_id", profile.orgId),
    ]);
    setRequests(reqs ?? []);
    setHolidayDates(new Set((holidays ?? []).map((h) => h.holiday_date)));
    setLoaded(true);
  }, [profile, supabase, historyYear]);

  useEffect(() => {
    load();
  }, [load]);

  function computeHours(): number {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const hours = eh + em / 60 - (sh + sm / 60);
    return hours > 0 ? Math.round(hours * 100) / 100 : 0;
  }

  const isHoliday = holidayDates.has(workDate);
  const rateMultiplier = isHoliday ? OT_RATE.holiday : OT_RATE.normal;
  // "This month" here means the same OT cutoff window payroll actually pays out on (26th
  // of the prior month through the 25th), not the calendar month — otherwise this figure
  // wouldn't match what shows up on the payslip.
  const otWindow = getOtCutoffWindow(currentOtCutoffMonthKey());
  const approvedHoursThisMonth = requests
    .filter((r) => r.status === "approved" && r.work_date >= otWindow.start && r.work_date <= otWindow.end)
    .reduce((sum, r) => sum + Number(r.approved_hours ?? 0), 0);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    const hours = computeHours();
    if (!workDate || hours <= 0) {
      setError("กรุณาระบุวันที่และเวลาให้ถูกต้อง");
      return;
    }
    if (workDate < earliestAllowedOtDate()) {
      setError(`ขอ OT ย้อนหลังได้ไม่เกิน ${MAX_BACKDATE_DAYS} วัน`);
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("overtime_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      work_date: workDate,
      start_time: startTime,
      end_time: endTime,
      requested_hours: hours,
      rate_multiplier: rateMultiplier,
      task_description: taskDescription || null,
      reason,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message.includes("row-level security") ? `ขอ OT ย้อนหลังได้ไม่เกิน ${MAX_BACKDATE_DAYS} วัน` : insertError.message);
      return;
    }
    setWorkDate("");
    setTaskDescription("");
    setReason("");
    setSuccess("ส่งคำขอ OT เรียบร้อยแล้ว");
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ทำงานล่วงเวลา (OT)</h1>

      <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-xs text-on-surface-variant">ชั่วโมง OT ที่อนุมัติแล้วเดือนนี้</p>
        <p className="mt-1 text-xl font-bold text-primary">{approvedHoursThisMonth} ชม.</p>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold text-on-surface-variant">ขอทำงานล่วงเวลา</p>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันที่</label>
          <input
            type="date"
            value={workDate}
            min={earliestAllowedOtDate()}
            onChange={(e) => setWorkDate(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เวลาเริ่ม</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เวลาสิ้นสุด</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">งานที่ทำ (ถ้ามี)</label>
          <input
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เหตุผล</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="ระบุเหตุผลการขอ OT"
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-surface-container p-3.5">
          <span className="text-sm font-semibold">รวม: {computeHours()} ชม.</span>
          <span className="text-xs text-on-surface-variant">
            อัตรา x{rateMultiplier}
            {isHoliday && " (วันหยุด)"}
          </span>
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
          {submitting ? "กำลังส่ง..." : "ส่งคำขอ OT"}
        </button>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-on-surface">ประวัติ OT</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setHistoryYear((y) => y - 1)} className="rounded-lg border border-outline-variant px-2 py-1 text-xs font-semibold text-on-surface-variant">
              ← {historyYear - 1 + 543}
            </button>
            <span className="text-sm font-bold text-on-surface">{historyYear + 543}</span>
            <button
              onClick={() => setHistoryYear((y) => y + 1)}
              disabled={historyYear >= new Date().getFullYear()}
              className="rounded-lg border border-outline-variant px-2 py-1 text-xs font-semibold text-on-surface-variant disabled:opacity-40"
            >
              {historyYear + 1 + 543} →
            </button>
          </div>
        </div>
        {loaded && requests.length === 0 && <p className="text-sm text-on-surface-variant">ไม่มีประวัติ OT ในปี {historyYear + 543}</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">{new Date(r.work_date).toLocaleDateString("th-TH")}</p>
                <p className="text-xs text-on-surface-variant">
                  {r.start_time} - {r.end_time} ({r.requested_hours} ชม. x{r.rate_multiplier})
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
