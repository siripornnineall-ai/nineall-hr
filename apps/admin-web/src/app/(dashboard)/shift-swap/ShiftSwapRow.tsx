"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { decideShiftSwapRequest } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

export interface ShiftSwapRowData {
  id: string;
  requesterName: string;
  requesterCode: string;
  targetName: string | null;
  workDate: string | null;
  shiftName: string | null;
  reason: string | null;
  status: string;
}

export function ShiftSwapRow({ row }: { row: ShiftSwapRowData }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await decideShiftSwapRequest(row.id, decision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        {row.requesterName}
        <div className="text-xs text-on-surface-variant">{row.requesterCode}</div>
      </td>
      <td className="px-4 py-3">{row.workDate ? new Date(row.workDate).toLocaleDateString("th-TH") : "-"}</td>
      <td className="px-4 py-3">{row.shiftName ?? "-"}</td>
      <td className="px-4 py-3">{row.targetName ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.reason ?? "-"}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          {row.status === "pending" && (
            <div className="flex justify-end gap-2">
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
            </div>
          )}
          {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
