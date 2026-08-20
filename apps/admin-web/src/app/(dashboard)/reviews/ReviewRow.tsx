"use client";

import { useState, useTransition } from "react";
import { Avatar } from "@/components/Avatar";
import { deleteReviewAction } from "./actions";

export interface ReviewRowData {
  id: string;
  employeeCode: string;
  employeeName: string;
  employeePhotoUrl: string | null;
  reviewPeriod: string;
  rating: number;
  strengths: string | null;
  improvements: string | null;
  reviewerName: string | null;
}

export function ReviewRow({ row }: { row: ReviewRowData }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteReviewAction(row.id);
      if (result?.error) setError(result.error);
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
      <td className="px-4 py-3">{row.reviewPeriod}</td>
      <td className="px-4 py-3 text-center font-bold text-primary">{row.rating} / 5</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.strengths ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.improvements ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.reviewerName ?? "-"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-status-danger">ลบแน่ใจ?</span>
              <button onClick={remove} disabled={isPending} className="text-xs font-bold text-status-danger hover:underline">
                ยืนยัน
              </button>
              <button onClick={() => setConfirmingDelete(false)} disabled={isPending} className="text-xs font-semibold text-on-surface-variant hover:underline">
                ยกเลิก
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="text-xs font-bold text-status-danger hover:underline">
              ลบ
            </button>
          )}
          {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
