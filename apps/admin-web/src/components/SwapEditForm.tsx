"use client";

import { useState, useTransition } from "react";

export interface SwapEditValues {
  firstDate: string; // holiday swap: the holiday worked; day-off swap: the day off that is worked instead ("" = none)
  substituteDate: string;
  unit: "full_day" | "half_day";
  period: "morning" | "afternoon" | null;
  reason: string;
}

interface Props {
  firstLabel: string;
  firstOptional?: boolean;
  substituteLabel: string;
  initial: SwapEditValues;
  approved: boolean;
  onSave: (values: SwapEditValues) => Promise<{ error?: string } | void>;
  onCancel: () => void;
}

// Inline editor for a day-off swap / holiday swap request (HR / super admin). Used by both admin swap pages.
// (touched 2026-11-12 only to trigger a new admin-web deploy after a transient Google Fonts build failure)
export function SwapEditForm({ firstLabel, firstOptional, substituteLabel, initial, approved, onSave, onCancel }: Props) {
  const [values, setValues] = useState<SwapEditValues>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const noFirstDate = !!firstOptional && !values.firstDate;
  const unit = noFirstDate ? "full_day" : values.unit;

  function save() {
    setError(null);
    if (!values.firstDate && !firstOptional) {
      setError(`กรุณาเลือก${firstLabel}`);
      return;
    }
    if (!values.substituteDate) {
      setError(`กรุณาเลือก${substituteLabel}`);
      return;
    }
    if (unit === "half_day" && !values.period) {
      setError("กรุณาเลือกช่วงครึ่งวัน (เช้า/บ่าย)");
      return;
    }
    startTransition(async () => {
      const result = await onSave({ ...values, unit, period: unit === "half_day" ? values.period : null });
      if (result?.error) setError(result.error);
    });
  }

  const input = "h-10 w-full rounded-lg border border-outline-variant px-3 text-sm";
  const label = "mb-1 block text-xs font-semibold text-on-surface-variant";

  return (
    <div className="space-y-3 rounded-lg border border-primary bg-primary/5 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className={label}>
            {firstLabel}
            {firstOptional && " (เว้นว่าง = ขอวันหยุดตรง ไม่ต้องชดเชย)"}
          </label>
          <input type="date" value={values.firstDate} onChange={(e) => setValues({ ...values, firstDate: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>{substituteLabel}</label>
          <input type="date" value={values.substituteDate} onChange={(e) => setValues({ ...values, substituteDate: e.target.value })} className={input} />
        </div>
        <div>
          <label className={label}>จำนวนที่ทำงาน</label>
          <select
            value={unit}
            disabled={noFirstDate}
            onChange={(e) => setValues({ ...values, unit: e.target.value as "full_day" | "half_day", period: e.target.value === "half_day" ? (values.period ?? "morning") : null })}
            className={input}
          >
            <option value="full_day">เต็มวัน</option>
            <option value="half_day">ครึ่งวัน</option>
          </select>
        </div>
        <div>
          <label className={label}>ช่วง (ครึ่งวัน)</label>
          <select
            value={values.period ?? ""}
            disabled={unit !== "half_day"}
            onChange={(e) => setValues({ ...values, period: (e.target.value || null) as "morning" | "afternoon" | null })}
            className={input}
          >
            <option value="">-</option>
            <option value="morning">เช้า</option>
            <option value="afternoon">บ่าย</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label}>เหตุผล</label>
        <input value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} className={input} />
      </div>
      {approved && (
        <p className="text-xs text-on-surface-variant">
          คำขอนี้อนุมัติแล้ว — เมื่อบันทึก ระบบจะคืนตารางเดิมของวันที่เก่า แล้วอนุมัติใหม่ตามวันที่ใหม่ให้อัตโนมัติ
        </p>
      )}
      {error && <p className="text-xs font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={isPending} className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
        <button onClick={onCancel} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
