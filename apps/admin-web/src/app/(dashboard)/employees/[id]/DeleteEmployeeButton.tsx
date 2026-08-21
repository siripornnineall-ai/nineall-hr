"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEmployeeAction } from "../actions";

export function DeleteEmployeeButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      try {
        await deleteEmployeeAction(employeeId, reason);
        router.push("/employees");
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
        className="mt-2 w-full rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-variant/20"
      >
        ลบพนักงาน (เพิ่มผิด/ยังไม่เคยเริ่มงานจริง)
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-outline-variant bg-surface-container p-4 text-left">
      <p className="text-xs text-on-surface-variant">
        ใช้เมื่อกรอกพนักงานผิด/ซ้ำ/ยังไม่เคยเริ่มงานจริงเท่านั้น — ถ้าเป็นพนักงานที่เคยทำงานจริงแล้วลาออก ให้ใช้ปุ่ม
        &quot;ทำเครื่องหมายว่าลาออก/พ้นสภาพ&quot; แทน เพื่อเก็บประวัติไว้ การลบจะซ่อนพนักงานคนนี้ออกจากทุกรายการและปิดการเข้าสู่ระบบทันที
        (รหัสพนักงานจะนำไปใช้ซ้ำได้)
      </p>
      <div>
        <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เหตุผล (ไม่บังคับ)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-status-danger bg-error-container/20 p-3">
          <p className="text-sm font-semibold text-on-surface">ยืนยันลบพนักงานคนนี้? การกระทำนี้ปิดการเข้าสู่ระบบทันทีและซ่อนออกจากทุกรายการ</p>
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
              className="flex-1 rounded-lg bg-status-danger px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setOpen(false)} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
            ยกเลิก
          </button>
          <button onClick={() => setConfirming(true)} className="flex-1 rounded-lg bg-status-danger px-4 py-2 text-sm font-bold text-white">
            ลบพนักงาน
          </button>
        </div>
      )}
    </div>
  );
}
