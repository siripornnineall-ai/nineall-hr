"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { decideReimbursementRequest } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  pending: { tone: "warning", label: "รออนุมัติ" },
  approved: { tone: "success", label: "อนุมัติแล้ว" },
  rejected: { tone: "danger", label: "ปฏิเสธ" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

export interface ReimbursementRowData {
  id: string;
  expenseDate: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
  receiptUrl: string | null;
  employeeCode: string;
  employeeName: string;
}

export function ReimbursementRow({ row }: { row: ReimbursementRowData }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function decide(decision: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        await decideReimbursementRequest(row.id, decision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        {row.employeeName}
        <div className="text-xs text-on-surface-variant">{row.employeeCode}</div>
      </td>
      <td className="px-4 py-3">{new Date(row.expenseDate).toLocaleDateString("th-TH")}</td>
      <td className="px-4 py-3">{row.category}</td>
      <td className="px-4 py-3 text-right">{row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.description ?? "-"}</td>
      <td className="px-4 py-3">
        {row.receiptUrl ? (
          <a href={row.receiptUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">
            ดูใบเสร็จ
          </a>
        ) : (
          <span className="text-xs text-on-surface-variant">-</span>
        )}
      </td>
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
