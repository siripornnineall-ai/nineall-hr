"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { decideLeaveRequest, updateLeaveRequestAction } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

interface LeaveRowData {
  id: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  status: string;
  reason: string | null;
  employeeCode: string;
  employeeName: string;
}

export function LeaveRow({ row, leaveTypes }: { row: LeaveRowData; leaveTypes: { id: string; name_th: string }[] }) {
  const [editing, setEditing] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState(row.leaveTypeId);
  const [startDate, setStartDate] = useState(row.startDate);
  const [endDate, setEndDate] = useState(row.endDate);
  const [totalDays, setTotalDays] = useState(String(row.totalDays));
  const [reason, setReason] = useState(row.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateLeaveRequestAction(row.id, { leaveTypeId, startDate, endDate, totalDays, reason });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(() => decideLeaveRequest(row.id, decision));
  }

  if (editing) {
    return (
      <tr>
        <td className="px-4 py-3" colSpan={7}>
          <div className="space-y-2">
            <p className="text-xs font-bold text-on-surface-variant">
              {row.employeeName} ({row.employeeCode})
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ประเภทลา</label>
                <select value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm">
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name_th}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันที่เริ่ม</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันที่สิ้นสุด</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">จำนวนวัน</label>
                <input
                  type="number"
                  step="0.5"
                  value={totalDays}
                  onChange={(e) => setTotalDays(e.target.value)}
                  className="h-9 w-20 rounded-lg border border-outline-variant px-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เหตุผล</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 w-full rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={save} disabled={isPending} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                {isPending ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button onClick={() => setEditing(false)} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
                ยกเลิก
              </button>
              {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        {row.employeeName}
        <div className="text-xs text-on-surface-variant">{row.employeeCode}</div>
      </td>
      <td className="px-4 py-3">{row.leaveTypeName}</td>
      <td className="px-4 py-3">
        {new Date(row.startDate).toLocaleDateString("th-TH")} - {new Date(row.endDate).toLocaleDateString("th-TH")}
      </td>
      <td className="px-4 py-3">{row.totalDays} วัน</td>
      <td className="max-w-[220px] truncate px-4 py-3" title={row.reason ?? ""}>
        {row.reason ?? "-"}
      </td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setEditing(true)}
            disabled={isPending}
            className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-variant/20 disabled:opacity-60"
          >
            แก้ไข
          </button>
          {row.status === "pending" && (
            <>
              <button onClick={() => decide("approved")} disabled={isPending} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                อนุมัติ
              </button>
              <button
                onClick={() => decide("rejected")}
                disabled={isPending}
                className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-60"
              >
                ปฏิเสธ
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
