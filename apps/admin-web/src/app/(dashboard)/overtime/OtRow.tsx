"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { decideOvertimeRequest, deleteOvertimeRequestAction, updateOvertimeRequestAction } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

interface OtRowData {
  id: string;
  workDate: string;
  startTime: string;
  endTime: string;
  requestedHours: number;
  rateMultiplier: number;
  status: string;
  taskDescription: string | null;
  reason: string | null;
  employeeCode: string;
  employeeName: string;
  employeePhotoUrl: string | null;
}

export function OtRow({ row }: { row: OtRowData }) {
  const [editing, setEditing] = useState(false);
  const [workDate, setWorkDate] = useState(row.workDate);
  const [startTime, setStartTime] = useState(row.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(row.endTime.slice(0, 5));
  const [rateMultiplier, setRateMultiplier] = useState(String(row.rateMultiplier));
  const [taskDescription, setTaskDescription] = useState(row.taskDescription ?? "");
  const [reason, setReason] = useState(row.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateOvertimeRequestAction(row.id, { workDate, startTime, endTime, rateMultiplier, taskDescription, reason });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(() => decideOvertimeRequest(row.id, decision));
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteOvertimeRequestAction(row.id);
      if (result?.error) {
        setError(result.error);
        setConfirmingDelete(false);
      }
    });
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
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันที่</label>
                <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เวลาเริ่ม</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เวลาสิ้นสุด</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">อัตรา</label>
                <input
                  type="number"
                  step="0.1"
                  value={rateMultiplier}
                  onChange={(e) => setRateMultiplier(e.target.value)}
                  className="h-9 w-20 rounded-lg border border-outline-variant px-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-on-surface-variant">งานที่ทำ</label>
                <input
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
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
        <div className="flex items-center gap-2">
          <Avatar url={row.employeePhotoUrl} size={28} />
          <div>
            {row.employeeName}
            <div className="text-xs font-normal text-on-surface-variant">{row.employeeCode}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">{new Date(row.workDate).toLocaleDateString("th-TH")}</td>
      <td className="px-4 py-3">
        {row.startTime.slice(0, 5)} - {row.endTime.slice(0, 5)}
      </td>
      <td className="px-4 py-3">{row.requestedHours} ชม.</td>
      <td className="px-4 py-3">x{row.rateMultiplier}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
        {confirmingDelete ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs font-semibold text-status-danger">ลบคำขอนี้?</span>
            <button onClick={confirmDelete} disabled={isPending} className="rounded-lg bg-status-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
              {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
            </button>
            <button onClick={() => setConfirmingDelete(false)} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
              ยกเลิก
            </button>
          </div>
        ) : (
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
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className="rounded-lg border border-status-danger px-3 py-1.5 text-xs font-bold text-status-danger hover:bg-error-container/20 disabled:opacity-60"
            >
              ลบ
            </button>
          </div>
        )}
        {error && <p className="mt-1 text-right text-xs font-semibold text-status-danger">{error}</p>}
      </td>
    </tr>
  );
}
