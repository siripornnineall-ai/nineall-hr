"use client";

import { useState, useTransition } from "react";
import { syncLeaveBalancesAction } from "./actions";

export function SyncLeaveBalancesButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await syncLeaveBalancesAction();
      if (result.error) setError(result.error);
      else setMessage(`อัปเดตสิทธิวันลาให้พนักงาน ${result.grantedCount ?? 0} คนเรียบร้อยแล้ว`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={isPending}
        className="flex h-12 items-center gap-2 rounded-xl border border-outline-variant px-6 font-bold text-on-surface shadow-sm transition-all hover:bg-surface-variant/20 disabled:opacity-60"
      >
        <span className="material-symbols-outlined">event_available</span>
        {isPending ? "กำลังอัปเดต..." : "อัปเดตสิทธิวันลาพนักงานทั้งหมด"}
      </button>
      {message && <p className="text-xs font-semibold text-status-success">{message}</p>}
      {error && <p className="text-xs font-semibold text-status-danger">{error}</p>}
    </div>
  );
}
