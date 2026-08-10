"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approvePayrollRunAction, calculatePayrollRunAction, lockPayrollRunAction, submitPayrollRunAction } from "../actions";

export function RunActions({ runId, status, canLock }: { runId: string; status: string; canLock: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-sm font-semibold text-error">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {status !== "locked" && (
          <button
            disabled={isPending}
            onClick={() => run(() => calculatePayrollRunAction(runId))}
            className="flex items-center gap-2 rounded-xl border border-primary px-6 py-3 text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">auto_fix</span>
            คำนวณเงินเดือนอัตโนมัติ
          </button>
        )}
        {status === "under_review" && (
          <button
            disabled={isPending}
            onClick={() => run(() => submitPayrollRunAction(runId))}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
          >
            <span className="material-symbols-outlined">send</span>
            ส่งอนุมัติ
          </button>
        )}
        {status === "pending_approval" && (
          <button
            disabled={isPending}
            onClick={() => run(() => approvePayrollRunAction(runId))}
            className="rounded-xl bg-green-600 px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
          >
            อนุมัติรอบเงินเดือน
          </button>
        )}
        {status === "approved" && canLock && (
          <button
            disabled={isPending}
            onClick={() => run(() => lockPayrollRunAction(runId))}
            className="rounded-xl bg-on-surface px-6 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50"
          >
            ล็อกรอบและออกสลิป
          </button>
        )}
      </div>
    </div>
  );
}
