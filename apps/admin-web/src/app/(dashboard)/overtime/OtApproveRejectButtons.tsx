"use client";

import { useTransition } from "react";
import { decideOvertimeRequest } from "./actions";

export function OtApproveRejectButtons({ requestId }: { requestId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex justify-end gap-2">
      <button
        disabled={isPending}
        onClick={() => startTransition(() => decideOvertimeRequest(requestId, "approved"))}
        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
      >
        อนุมัติ
      </button>
      <button
        disabled={isPending}
        onClick={() => startTransition(() => decideOvertimeRequest(requestId, "rejected"))}
        className="rounded-lg border border-red-600 px-3 py-1.5 text-xs font-bold text-red-600 disabled:opacity-50"
      >
        ปฏิเสธ
      </button>
    </div>
  );
}
