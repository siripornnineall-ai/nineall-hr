"use client";

import { useState, useTransition } from "react";
import { deleteTrainingRecordAction } from "./actions";

export interface TrainingRowData {
  id: string;
  employeeCode: string;
  employeeName: string;
  title: string;
  provider: string | null;
  trainingDate: string;
  hours: number | null;
  notes: string | null;
}

export function TrainingRow({ row }: { row: TrainingRowData }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteTrainingRecordAction(row.id);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        {row.employeeName}
        <div className="text-xs text-on-surface-variant">{row.employeeCode}</div>
      </td>
      <td className="px-4 py-3">{row.title}</td>
      <td className="px-4 py-3">{row.provider ?? "-"}</td>
      <td className="px-4 py-3">{new Date(row.trainingDate).toLocaleDateString("th-TH")}</td>
      <td className="px-4 py-3">{row.hours ?? "-"}</td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.notes ?? "-"}</td>
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
