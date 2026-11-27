"use client";

import { useState, useTransition } from "react";
import { cancelScheduledOffboardingAction, offboardEmployeeAction } from "../actions";

const todayBangkok = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
const fmtThai = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

export function OffboardButton({
  employeeId,
  currentStatus,
  pendingExitStatus,
  pendingExitDate,
}: {
  employeeId: string;
  currentStatus: string;
  pendingExitStatus?: string | null;
  pendingExitDate?: string | null;
}) {
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

  // A resignation with a future (or today's) last day is only SCHEDULED: the person stays in the system as normal until that day has passed.
  if (pendingExitStatus) {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-left">
        <p className="text-sm font-bold text-amber-900">
          กำหนด{pendingExitStatus === "resigned" ? "ลาออก" : "พ้นสภาพ"}: วันที่ {pendingExitDate ? fmtThai(pendingExitDate) : "-"}
        </p>
        <p className="text-xs text-amber-800">ยังใช้งานระบบได้ตามปกติ (เข้า–ออกงาน ลา ขอ OT ฯลฯ) ระบบจะเปลี่ยนสถานะและปิดการเข้าสู่ระบบให้เองหลังสิ้นวันที่กำหนด</p>
        {error && <p className="text-sm font-semibold text-error">{error}</p>}
        <button
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              try {
                await cancelScheduledOffboardingAction(employeeId);
              } catch (e) {
                setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
              }
            })
          }
          className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-60"
        >
          {isPending ? "กำลังยกเลิก..." : "ยกเลิกการ" + (pendingExitStatus === "resigned" ? "ลาออก" : "พ้นสภาพ")}
        </button>
      </div>
    );
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
        ระบบจะไม่ลบข้อมูลพนักงานคนนี้ (ประวัติเงินเดือน/เวลาเข้างานยังเก็บไว้ตามกฎหมาย) แค่เปลี่ยนสถานะและปิดการเข้าสู่ระบบเท่านั้น ถ้าวันที่มีผลเป็นวันนี้หรืออนาคต พนักงานจะยังอยู่ในระบบและใช้งานได้ตามปกติจนสิ้นวันนั้น
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
            ยืนยันบันทึกว่าพนักงานคนนี้{status === "resigned" ? "ลาออก" : "พ้นสภาพการเป็นพนักงาน"}?{" "}
            {effectiveDate >= todayBangkok()
              ? `พนักงานจะยังอยู่ในระบบและใช้งานได้ตามปกติจนถึงสิ้นวันที่ ${fmtThai(effectiveDate)} แล้วระบบจะปิดการเข้าสู่ระบบให้อัตโนมัติ`
              : "วันที่มีผลผ่านไปแล้ว การกระทำนี้จะปิดการเข้าสู่ระบบของพนักงานทันที"}
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
