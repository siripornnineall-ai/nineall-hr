"use client";

import { useActionState } from "react";
import { createLeaveTypeAction, type LeaveTypeActionState } from "./actions";

const initialState: LeaveTypeActionState = {};

export function NewLeaveTypeForm() {
  const [state, formAction, isPending] = useActionState(createLeaveTypeAction, initialState);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="col-span-2 font-bold">เพิ่มประเภทการลา</h3>
      {state.error && <div className="col-span-2 rounded-lg bg-error-container px-3 py-2 text-xs text-on-error-container">{state.error}</div>}
      <input name="code" required placeholder="รหัส เช่น SICK" className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
      <input name="nameTh" required placeholder="ชื่อภาษาไทย" className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
      <input name="nameEn" placeholder="ชื่อภาษาอังกฤษ" className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
      <input name="daysPerYear" type="number" step="0.5" required placeholder="จำนวนวัน/ปี" className="h-10 rounded-lg border border-outline-variant px-3 text-sm" />
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="isPaid" defaultChecked className="accent-primary" /> ได้รับค่าจ้าง
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowHalfDay" defaultChecked className="accent-primary" /> ลาครึ่งวันได้
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowHourly" className="accent-primary" /> ลารายชั่วโมงได้
      </label>
      <label className="col-span-2 flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresAttachment" className="accent-primary" /> ต้องแนบเอกสาร
      </label>
      <button type="submit" disabled={isPending} className="col-span-2 h-10 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-50">
        {isPending ? "กำลังบันทึก..." : "เพิ่มประเภทการลา"}
      </button>
    </form>
  );
}
