"use client";

import { useState, useTransition } from "react";
import { deleteAnnouncementAction } from "./actions";

export function DeleteAnnouncementButton({ announcementId }: { announcementId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteAnnouncementAction(announcementId);
      if (result?.error) setError(result.error);
    });
  }

  if (confirming) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[11px] font-semibold text-status-danger">ลบแน่ใจ?</span>
        <button onClick={remove} disabled={isPending} className="text-xs font-bold text-status-danger hover:underline">
          ยืนยัน
        </button>
        <button onClick={() => setConfirming(false)} disabled={isPending} className="text-xs font-semibold text-on-surface-variant hover:underline">
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button onClick={() => setConfirming(true)} className="text-xs font-bold text-status-danger hover:underline">
        ลบ
      </button>
      {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
    </div>
  );
}
