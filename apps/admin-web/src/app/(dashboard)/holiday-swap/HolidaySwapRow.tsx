"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { decideHolidaySwapRequest } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
};

interface RowData {
  id: string;
  employeeCode: string;
  employeeName: string;
  employeePhotoUrl: string | null;
  holidayDate: string;
  holidayName: string | null;
  substituteDate: string;
  reason: string | null;
  status: string;
}

export function HolidaySwapRow({ row }: { row: RowData }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await decideHolidaySwapRequest(row.id, decision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      }
    });
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
      <td className="px-4 py-3">
        {new Date(row.holidayDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
        {row.holidayName && <div className="text-xs text-on-surface-variant">{row.holidayName}</div>}
      </td>
      <td className="px-4 py-3">{new Date(row.substituteDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</td>
      <td className="px-4 py-3">{row.reason ?? "-"}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
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
        {error && <p className="mt-1 text-right text-xs font-semibold text-status-danger">{error}</p>}
      </td>
    </tr>
  );
}
