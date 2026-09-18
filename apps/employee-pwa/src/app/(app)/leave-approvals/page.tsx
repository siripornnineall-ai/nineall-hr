"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { AddBackdatedLeaveForm } from "./AddBackdatedLeaveForm";

// Leave is approved in two steps: the employee's หัวหน้างาน first, then HR/admin.
//   - HR / super_admin see only requests whose manager step is done (or that never had
//     one). Owner's rule: a request stays off the admin side until the หัวหน้า has approved
//     it — only a count of those still waiting is shown.
//   - A line manager sees only their own reports' requests that are waiting on them, via
//     get_manager_leave_queue() — หัวหน้า are ordinary 'employee' logins, so RLS on
//     leave_requests/employees wouldn't show them anything.
// Both go through the decide_leave_request RPC, which works out which step the caller is
// acting on.
interface LeaveRow {
  id: string;
  employeeName: string;
  employeeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string | null;
  stage: "manager" | "hr";
  managerName: string | null;
  managerComment: string | null;
}

interface BasicInfo {
  employee_id: string;
  first_name: string;
  last_name: string;
  nickname: string | null;
}

function formatThai(d: string): string {
  return new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export default function LeaveApprovalsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isLineManager, setIsLineManager] = useState<boolean | null>(null);
  const [waitingOnManagerCount, setWaitingOnManagerCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isHr = profile?.role === "super_admin" || profile?.role === "hr";

  const load = useCallback(async () => {
    if (!profile) return;

    if (isHr) {
      const { data } = await supabase
        .from("leave_requests")
        .select(
          "id, start_date, end_date, total_days, reason, approval_stage, manager_decided_by, manager_decision, manager_comment, employees!leave_requests_employee_id_fkey(employee_code, first_name, last_name, manager_employee_id), leave_types(name_th)"
        )
        .eq("org_id", profile.orgId)
        .eq("status", "pending")
        .order("created_at");

      const all = data ?? [];
      const list = all.filter((r) => r.approval_stage !== "manager");
      setWaitingOnManagerCount(all.length - list.length);
      // Names of the managers involved: whoever already approved, or whoever it's waiting on.
      const managerIds = Array.from(
        new Set(
          list
            .map((r) => {
              const emp = r.employees as unknown as { manager_employee_id: string | null } | null;
              return (r.manager_decided_by as string | null) ?? emp?.manager_employee_id ?? null;
            })
            .filter((id): id is string => !!id)
        )
      );
      const { data: people } = managerIds.length > 0 ? await supabase.rpc("get_employees_basic_info", { p_employee_ids: managerIds }) : { data: [] };
      const nameById = new Map<string, string>(((people ?? []) as BasicInfo[]).map((p) => [p.employee_id, p.nickname || `${p.first_name} ${p.last_name}`]));

      setRows(
        list.map((r) => {
          const emp = r.employees as unknown as { employee_code: string; first_name: string; last_name: string; manager_employee_id: string | null } | null;
          const leaveType = r.leave_types as unknown as { name_th: string } | null;
          const managerId = (r.manager_decided_by as string | null) ?? emp?.manager_employee_id ?? null;
          return {
            id: r.id,
            employeeName: emp ? `${emp.first_name} ${emp.last_name}` : "-",
            employeeCode: emp?.employee_code ?? "-",
            leaveTypeName: leaveType?.name_th ?? "-",
            startDate: r.start_date,
            endDate: r.end_date,
            totalDays: Number(r.total_days),
            reason: r.reason,
            stage: r.approval_stage === "manager" ? "manager" : "hr",
            managerName: managerId ? (nameById.get(managerId) ?? null) : null,
            managerComment: r.manager_decision === "approved" ? (r.manager_comment as string | null) : null,
          };
        })
      );
      setIsLineManager(false);
      setLoaded(true);
      return;
    }

    const [{ data: managerFlag }, { data: queue }] = await Promise.all([supabase.rpc("is_line_manager"), supabase.rpc("get_manager_leave_queue")]);
    setIsLineManager(managerFlag === true);
    setRows(
      ((queue ?? []) as { id: string; employee_code: string; employee_name: string; nickname: string | null; leave_type_name: string; start_date: string; end_date: string; total_days: number; reason: string | null }[]).map(
        (r) => ({
          id: r.id,
          employeeName: r.nickname ? `${r.nickname} (${r.employee_name})` : r.employee_name,
          employeeCode: r.employee_code,
          leaveTypeName: r.leave_type_name,
          startDate: r.start_date,
          endDate: r.end_date,
          totalDays: Number(r.total_days),
          reason: r.reason,
          stage: "manager" as const,
          managerName: null,
          managerComment: null,
        })
      )
    );
    setLoaded(true);
  }, [profile, supabase, isHr]);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(row: LeaveRow, decision: "approved" | "rejected", comment?: string) {
    setError(null);
    setNotice(null);
    setBusyId(row.id);
    const { error: rpcError } = await supabase.rpc("decide_leave_request", {
      p_request_id: row.id,
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
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    if (!isHr && decision === "approved") setNotice(`อนุมัติคำขอของ ${row.employeeName} แล้ว ส่งต่อให้ HR อนุมัติขั้นสุดท้าย`);
  }

  if (authLoading || (!isHr && isLineManager === null)) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  if (!isHr && !isLineManager) {
    return (
      <div className="safe-top space-y-3 px-4 pt-4 text-center">
        <p className="text-sm text-on-surface-variant">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
        <button onClick={() => router.push("/")} className="text-sm font-semibold text-primary">
          กลับหน้าแรก
        </button>
      </div>
    );
  }

  const hrRows = rows.filter((r) => r.stage === "hr");
  const managerRows = rows.filter((r) => r.stage === "manager");

  function renderCard(r: LeaveRow) {
    const waitingOnManager = isHr && r.stage === "manager";
    return (
      <div key={r.id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="font-bold text-on-surface">
          {r.employeeName} <span className="text-xs font-normal text-on-surface-variant">({r.employeeCode})</span>
        </p>
        <p className="mt-1 text-sm text-on-surface">{r.leaveTypeName}</p>
        <p className="text-xs text-on-surface-variant">
          {formatThai(r.startDate)}
          {r.endDate !== r.startDate && ` - ${formatThai(r.endDate)}`} ({r.totalDays} วัน)
        </p>
        {r.reason && <p className="mt-1 text-xs text-on-surface-variant">เหตุผล: {r.reason}</p>}

        {isHr && r.stage === "hr" && r.managerName && (
          <p className="mt-2 rounded-lg bg-status-success/10 px-2.5 py-1.5 text-xs font-semibold text-status-success">
            หัวหน้า ({r.managerName}) อนุมัติแล้ว{r.managerComment ? ` — ${r.managerComment}` : ""}
          </p>
        )}
        {waitingOnManager && (
          <p className="mt-2 rounded-lg bg-status-warning/10 px-2.5 py-1.5 text-xs font-semibold text-status-warning">
            รอหัวหน้า{r.managerName ? ` (${r.managerName})` : ""} อนุมัติก่อน
          </p>
        )}

        {rejectingId === r.id ? (
          <div className="mt-3 space-y-2">
            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="เหตุผลที่ปฏิเสธ (ถ้ามี)"
              className="h-9 w-full rounded-lg border border-outline-variant px-3 text-sm"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectingId(null)} className="h-9 flex-1 rounded-lg border border-outline-variant text-xs font-semibold text-on-surface-variant">
                ยกเลิก
              </button>
              <button
                onClick={() => decide(r, "rejected", rejectReason)}
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
              onClick={() => decide(r, "approved")}
              disabled={busyId === r.id}
              className="h-9 flex-1 rounded-lg bg-primary text-xs font-bold text-white disabled:opacity-50"
            >
              {waitingOnManager ? "อนุมัติแทนหัวหน้า" : isHr ? "อนุมัติ" : "อนุมัติ (ส่งต่อ HR)"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">{isHr ? "คำขอลารออนุมัติ" : "คำขอลาของทีม รอคุณอนุมัติ"}</h1>
      {!isHr && <p className="text-xs text-on-surface-variant">เมื่อคุณอนุมัติแล้ว คำขอจะถูกส่งต่อให้ HR อนุมัติขั้นสุดท้าย หากปฏิเสธ คำขอจะสิ้นสุดทันที</p>}

      {isHr && profile && <AddBackdatedLeaveForm orgId={profile.orgId} onSaved={load} />}

      {error && <p className="rounded-xl bg-status-danger/10 p-3 text-sm font-semibold text-status-danger">{error}</p>}
      {notice && <p className="rounded-xl bg-status-success/10 p-3 text-sm font-semibold text-status-success">{notice}</p>}

      {loaded && rows.length === 0 && <p className="text-center text-sm text-on-surface-variant">ไม่มีคำขอลารออนุมัติ</p>}
      {isHr && waitingOnManagerCount > 0 && (
        <p className="text-center text-xs text-on-surface-variant">
          มีอีก {waitingOnManagerCount} คำขอที่ยังรอหัวหน้างานอนุมัติ — จะแสดงที่นี่เมื่อหัวหน้าอนุมัติแล้ว
        </p>
      )}

      {isHr ? (
        <>
          {hrRows.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-on-surface">รอ HR อนุมัติ ({hrRows.length})</h2>
              {hrRows.map(renderCard)}
            </div>
          )}
          {managerRows.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-on-surface-variant">รอหัวหน้าอนุมัติ ({managerRows.length})</h2>
              {managerRows.map(renderCard)}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">{rows.map(renderCard)}</div>
      )}
    </div>
  );
}
