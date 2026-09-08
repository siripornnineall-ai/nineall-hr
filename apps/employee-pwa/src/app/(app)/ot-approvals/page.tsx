"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface OtRow {
  id: string;
  employeeName: string;
  employeeCode: string;
  workDate: string;
  startTime: string;
  endTime: string;
  requestedHours: number;
  rateMultiplier: number;
  reason: string | null;
  taskDescription: string | null;
}

// Mirrors admin-web's decideOvertimeRequest (apps/admin-web/src/app/(dashboard)/overtime/actions.ts)
// as a direct client update — overtime_requests_decide + approval_steps_write RLS already
// permit is_admin_or_hr()/is_manager_of(), so no RPC is needed here (unlike leave, OT decisions
// don't need to touch attendance_records).
export default function OtApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<OtRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canApprove = profile?.role === "super_admin" || profile?.role === "hr";

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("overtime_requests")
      .select(
        "id, work_date, start_time, end_time, requested_hours, rate_multiplier, reason, task_description, employees!overtime_requests_employee_id_fkey(employee_code, first_name, last_name)"
      )
      .eq("org_id", profile.orgId)
      .eq("status", "pending")
      .order("created_at");

    setRows(
      (data ?? []).map((r) => {
        const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
        return {
          id: r.id,
          employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
          employeeCode: emp?.employee_code ?? "-",
          workDate: r.work_date,
          startTime: r.start_time,
          endTime: r.end_time,
          requestedHours: Number(r.requested_hours),
          rateMultiplier: Number(r.rate_multiplier),
          reason: r.reason,
          taskDescription: r.task_description,
        };
      })
    );
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected", requestedHours: number) {
    setError(null);
    setBusyId(id);

    const { error: updateError } = await supabase
      .from("overtime_requests")
      .update({ status: decision, approved_hours: decision === "approved" ? requestedHours : null })
      .eq("id", id);

    if (updateError) {
      setBusyId(null);
      setError(updateError.message);
      return;
    }

    await supabase
      .from("approval_steps")
      .update({ status: decision, acted_at: new Date().toISOString(), approver_employee_id: profile!.employeeId })
      .eq("request_type", "overtime")
      .eq("request_id", id)
      .eq("status", "pending");

    setBusyId(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  if (authLoading) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (!canApprove) {
    return (
      <div className="safe-top space-y-3 px-4 pt-4 text-center">
        <p className="text-sm text-on-surface-variant">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        <button onClick={() => router.push("/")} className="text-sm font-semibold text-primary">
          กลับหน้าแรก
        </button>
      </div>
    );
  }

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">คำขอ OT รออนุมัติ</h1>

      {error && <p className="rounded-xl bg-status-danger/10 p-3 text-sm font-semibold text-status-danger">{error}</p>}

      {loaded && rows.length === 0 && <p className="text-center text-sm text-on-surface-variant">ไม่มีคำขอ OT รออนุมัติ</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <p className="font-bold text-on-surface">
              {r.employeeName} <span className="text-xs font-normal text-on-surface-variant">({r.employeeCode})</span>
            </p>
            <p className="mt-1 text-sm text-on-surface">
              {new Date(r.workDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} · {r.startTime.slice(0, 5)} -{" "}
              {r.endTime.slice(0, 5)} ({r.requestedHours} ชม. × {r.rateMultiplier})
            </p>
            {r.taskDescription && <p className="mt-1 text-xs text-on-surface-variant">งาน: {r.taskDescription}</p>}
            {r.reason && <p className="mt-1 text-xs text-on-surface-variant">เหตุผล: {r.reason}</p>}

            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide(r.id, "rejected", r.requestedHours)}
                disabled={busyId === r.id}
                className="h-9 flex-1 rounded-lg border border-status-danger text-xs font-bold text-status-danger disabled:opacity-50"
              >
                ปฏิเสธ
              </button>
              <button
                onClick={() => decide(r.id, "approved", r.requestedHours)}
                disabled={busyId === r.id}
                className="h-9 flex-1 rounded-lg bg-primary text-xs font-bold text-white disabled:opacity-50"
              >
                อนุมัติ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
