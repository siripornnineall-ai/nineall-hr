"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface RequestRow {
  id: string;
  kind: "leave" | "overtime";
  title: string;
  detail: string;
  status: string;
  createdAt: string;
}

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function RequestsPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const [{ data: leave }, { data: ot }] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("id, start_date, end_date, total_days, status, created_at, leave_types(name_th)")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("overtime_requests")
        .select("id, work_date, requested_hours, status, created_at")
        .eq("employee_id", profile.employeeId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const leaveRows: RequestRow[] = (leave ?? []).map((r) => ({
      id: r.id,
      kind: "leave",
      title: (r.leave_types as unknown as { name_th: string } | null)?.name_th ?? "ลางาน",
      detail: `${r.start_date} - ${r.end_date} (${r.total_days} วัน)`,
      status: r.status,
      createdAt: r.created_at,
    }));
    const otRows: RequestRow[] = (ot ?? []).map((r) => ({
      id: r.id,
      kind: "overtime",
      title: "ทำงานล่วงเวลา (OT)",
      detail: `${new Date(r.work_date).toLocaleDateString("th-TH")} (${r.requested_hours} ชม.)`,
      status: r.status,
      createdAt: r.created_at,
    }));

    setRows([...leaveRows, ...otRows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">คำขอทั้งหมด</h1>
      {loaded && rows.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีคำขอ</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{r.kind === "leave" ? "event_note" : "timer"}</span>
            <div className="flex-1">
              <p className="font-semibold text-on-surface">{r.title}</p>
              <p className="text-xs text-on-surface-variant">{r.detail}</p>
            </div>
            <span className={clsx("text-xs font-bold", STATUS_CLASS[r.status])}>{STATUS_TH[r.status] ?? r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
