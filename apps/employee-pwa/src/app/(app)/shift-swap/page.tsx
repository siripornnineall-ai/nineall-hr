"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface AssignmentOption {
  id: string;
  work_date: string;
  shift_name: string | null;
}

interface SwapRow {
  id: string;
  reason: string | null;
  status: string;
  created_at: string;
  original_work_date: string | null;
  original_shift_name: string | null;
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function ShiftSwapPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [requests, setRequests] = useState<SwapRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [originalAssignmentId, setOriginalAssignmentId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // target_employee_id is intentionally never set from here: employees_select RLS only
  // lets a plain employee read their own row (is_self/is_admin_or_hr/is_manager_of), so
  // there's no colleague directory this page could show to pick a swap target from.
  // The "who to swap with" detail goes in the free-text reason instead — HR sorts out
  // the actual reassignment through the existing Attendance shift editor.
  const load = useCallback(async () => {
    if (!profile) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: assign }, { data: swaps }] = await Promise.all([
      supabase
        .from("shift_assignments")
        .select("id, work_date, is_day_off, work_shifts(name)")
        .eq("employee_id", profile.employeeId)
        .gte("work_date", today)
        .order("work_date")
        .limit(14),
      supabase
        .from("shift_swap_requests")
        .select("id, reason, status, created_at, shift_assignments!shift_swap_requests_original_assignment_id_fkey(work_date, work_shifts(name))")
        .eq("requester_employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setAssignments(
      (assign ?? [])
        .filter((a) => !a.is_day_off)
        .map((a) => ({ id: a.id, work_date: a.work_date, shift_name: (a.work_shifts as unknown as { name: string } | null)?.name ?? null }))
    );
    setRequests(
      (swaps ?? []).map((s) => {
        const orig = s.shift_assignments as unknown as { work_date: string; work_shifts: { name: string } | null } | null;
        return {
          id: s.id,
          reason: s.reason,
          status: s.status,
          created_at: s.created_at,
          original_work_date: orig?.work_date ?? null,
          original_shift_name: orig?.work_shifts?.name ?? null,
        };
      })
    );
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!originalAssignmentId) {
      setError("กรุณาเลือกวันที่ต้องการสลับ/แก้กะ");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("shift_swap_requests").insert({
      org_id: profile!.orgId,
      requester_employee_id: profile!.employeeId,
      original_assignment_id: originalAssignmentId,
      reason: reason || null,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setOriginalAssignmentId("");
    setReason("");
    setSuccess("ส่งคำขอสลับ/แก้กะเรียบร้อยแล้ว รอ HR ยืนยัน");
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">สลับ/แก้กะทำงาน</h1>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold text-on-surface-variant">ขอสลับ/แก้กะ</p>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">กะของฉันที่ต้องการเปลี่ยน</label>
          <select
            value={originalAssignmentId}
            onChange={(e) => setOriginalAssignmentId(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          >
            <option value="">-- เลือกวันที่ --</option>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.work_date).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" })} — {a.shift_name ?? "ไม่ระบุกะ"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">เหตุผล / ต้องการสลับกับใคร</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="เช่น ขอสลับกะกับ Ting วันที่ 25 ส.ค. เนื่องจากติดธุระ"
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
        {loaded && requests.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีคำขอสลับ/แก้กะ</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">
                  {r.original_work_date ? new Date(r.original_work_date).toLocaleDateString("th-TH") : "-"} — {r.original_shift_name ?? "ไม่ระบุกะ"}
                </p>
                <p className="text-xs text-on-surface-variant">{r.reason ?? ""}</p>
              </div>
              <span className={clsx("text-xs font-bold", STATUS_CLASS[r.status])}>{STATUS_TH[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
