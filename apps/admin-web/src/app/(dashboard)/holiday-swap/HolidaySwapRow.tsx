"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { decideHolidaySwapRequest, deleteHolidaySwapRequestAction } from "./actions";

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
  unit: string;
  period: string | null;
  reason: string | null;
  status: string;
}

const PERIOD_TH: Record<string, string> = { morning: "เช้า", afternoon: "บ่าย" };

export function HolidaySwapRow({ row }: { row: RowData }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteHolidaySwapRequestAction(row.id);
      if (result?.error) setError(result.error);
      else setConfirmingDelete(false);
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
        {row.unit === "half_day" && row.period && <div className="text-xs text-on-surface-variant">ครึ่งวัน ({PERIOD_TH[row.period]})</div>}
        {row.holidayName && <div className="text-xs text-on-surface-variant">{row.holidayName}</div>}
      </td>
      <td className="px-4 py-3">
        {new Date(row.substituteDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
        {row.unit === "half_day" && row.period && (
          <div className="text-xs text-on-surface-variant">หยุดช่วง {PERIOD_TH[row.period]} (ยังต้องมาทำงานอีกครึ่งวันตามปกติ)</div>
        )}
      </td>
      <td className="px-4 py-3">{row.reason ?? "-"}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap justify-end gap-2">
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
          {confirmingDelete ? (
            <>
              <span className="self-center text-xs font-semibold text-status-danger">
                {row.status === "approved" ? "ลบและคืนตารางวันหยุด/วันทำงาน?" : "ลบคำขอนี้?"}
              </span>
              <button onClick={confirmDelete} disabled={isPending} className="rounded-lg bg-status-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
              <button onClick={() => setConfirmingDelete(false)} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
                ยกเลิก
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-status-danger hover:bg-status-danger/10 disabled:opacity-60"
            >
              ลบ
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-right text-xs font-semibold text-status-danger">{error}</p>}
      </td>
    </tr>
  );
}
