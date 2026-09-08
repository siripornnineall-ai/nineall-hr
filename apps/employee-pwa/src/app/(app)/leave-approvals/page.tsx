"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface LeaveRow {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
}

export default function LeaveApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canApprove = profile?.role === "super_admin" || profile?.role === "hr";

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("leave_requests")
      .select(
        "id, start_date, end_date, total_days, reason, employees!leave_requests_employee_id_fkey(employee_code, first_name, last_name), leave_types(name_th)"
      )
      .eq("org_id", profile.orgId)
      .eq("status", "pending")
      .order("created_at");

    setRows(
      (data ?? []).map((r) => {
        const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string } | null;
        const leaveType = r.leave_types as unknown as { name_th: string } | null;
        return {
          id: r.id,
          employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
          employeeCode: emp?.employee_code ?? "-",
          leaveTypeName: leaveType?.name_th ?? "-",
          startDate: r.start_date,
          endDate: r.end_date,
          totalDays: Number(r.total_days),
          reason: r.reason,
        };
      })
    );
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected", comment?: string) {
    setError(null);
    setBusyId(id);
    const { error: rpcError } = await supabase.rpc("decide_leave_request", {
      p_request_id: id,
      p_decision: decision,
      p_comment: comment || null,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setRejectingId(null);
    setRejectReason("");
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
      <h1 className="text-lg font-bold text-primary">คำขอลารออนุมัติ</h1>

      {error && <p className="rounded-xl bg-status-danger/10 p-3 text-sm font-semibold text-status-danger">{error}</p>}

      {loaded && rows.length === 0 && <p className="text-center text-sm text-on-surface-variant">ไม่มีคำขอลารออนุมัติ</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <p className="font-bold text-on-surface">
                {r.employeeName} <span className="text-xs font-normal text-on-surface-variant">({r.employeeCode})</span>
              </p>
            </div>
            <p className="mt-1 text-sm text-on-surface">{r.leaveTypeName}</p>
            <p className="text-xs text-on-surface-variant">
              {new Date(r.startDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
              {r.endDate !== r.startDate && ` - ${new Date(r.endDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`}
              {" "}({r.totalDays} วัน)
            </p>
            {r.reason && <p className="mt-1 text-xs text-on-surface-variant">เหตุผล: {r.reason}</p>}

            {rejectingId === r.id ? (
              <div className="mt-3 space-y-2">
                <input
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="เหตุผลที่ปฏิเสธ (ถ้ามี)"
                  className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setRejectingId(null)}
                    className="h-9 flex-1 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => decide(r.id, "rejected", rejectReason)}
                    disabled={busyId === r.id}
                    className="h-9 flex-1 rounded-lg bg-status-danger text-xs font-bold text-white disabled:opacity-50"
                  >
                    ยืนยันปฏิเสธ
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setRejectingId(r.id)}
                  disabled={busyId === r.id}
                  className="h-9 flex-1 rounded-lg border border-status-danger text-xs font-bold text-status-danger disabled:opacity-50"
                >
                  ปฏิเสธ
                </button>
                <button
                  onClick={() => decide(r.id, "approved")}
                  disabled={busyId === r.id}
                  className="h-9 flex-1 rounded-lg bg-primary text-xs font-bold text-white disabled:opacity-50"
                >
                  อนุมัติ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
