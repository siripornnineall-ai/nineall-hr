"use client";

import { useState, useTransition } from "react";
import { offboardEmployeeAction } from "../actions";

export function OffboardButton({ employeeId, currentStatus }: { employeeId: string; currentStatus: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"resigned" | "terminated">("resigned");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (currentStatus === "resigned" || currentStatus === "terminated") {
    return null;
  }

  function requestSubmit() {
    setError(null);
    if (!effectiveDate) {
      setError("กรุณาระบุวันที่มีผล");
      return;
    }
    setConfirming(true);
  }

  function submit() {
    startTransition(async () => {
      try {
        await offboardEmployeeAction(employeeId, status, effectiveDate, reason);
        setOpen(false);
        setConfirming(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        setConfirming(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-error px-4 py-2 text-sm font-bold text-error hover:bg-error-container/30"
      >
        ทำเครื่องหมายว่าลาออก / พ้นสภาพ
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-outline-variant bg-surface-container p-4 text-left">
      <p className="text-xs text-on-surface-variant">
        ระบบจะไม่ลบข้อมูลพนักงานคนนี้ (ประวัติเงินเดือน/เวลาเข้างานยังเก็บไว้ตามกฎหมาย) แค่เปลี่ยนสถานะและปิดการเข้าสู่ระบบเท่านั้น
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">สถานะ</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "resigned" | "terminated")}
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        >
          <option value="resigned">ลาออก</option>
          <option value="terminated">พ้นสภาพ/เลิกจ้าง</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันที่มีผล</label>
        <input
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">หมายเหตุ (ไม่บังคับ)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm font-semibold text-error">{error}</p>}

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-error bg-error-container/20 p-3">
          <p className="text-sm font-semibold text-on-surface">
            ยืนยันบันทึกว่าพนักงานคนนี้{status === "resigned" ? "ลาออก" : "พ้นสภาพการเป็นพนักงาน"}? การกระทำนี้จะปิดการเข้าสู่ระบบของพนักงานทันที
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirming(false)}
              disabled={isPending}
              className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant"
            >
              ย้อนกลับ
            </button>
            <button
              onClick={submit}
              disabled={isPending}
              className="flex-1 rounded-lg bg-error px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isPending ? "กำลังบันทึก..." : "ยืนยันแน่นอน"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
            ยกเลิก
          </button>
          <button onClick={requestSubmit} className="flex-1 rounded-lg bg-error px-4 py-2 text-sm font-bold text-white">
            ยืนยัน
          </button>
        </div>
      )}
    </div>
  );
}
