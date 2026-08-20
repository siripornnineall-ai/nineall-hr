"use client";

import { useState, useTransition } from "react";
import { createReviewAction } from "./actions";

interface EmployeeOption {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
}

export function AddReviewForm({ employees }: { employees: EmployeeOption[] }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [reviewPeriod, setReviewPeriod] = useState("");
  const [rating, setRating] = useState("3");
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [goalsNextPeriod, setGoalsNextPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setEmployeeId("");
    setReviewPeriod("");
    setRating("3");
    setStrengths("");
    setImprovements("");
    setGoalsNextPeriod("");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createReviewAction({ employeeId, reviewPeriod, rating, strengths, improvements, goalsNextPeriod });
      if (result?.error) setError(result.error);
      else {
        reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
        + บันทึกผลประเมิน
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">บันทึกผลการประเมินพนักงาน</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">พนักงาน</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- เลือกพนักงาน --</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code} — {e.first_name} {e.last_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">รอบการประเมิน</label>
          <input
            value={reviewPeriod}
            onChange={(e) => setReviewPeriod(e.target.value)}
            placeholder="เช่น ครึ่งปีหลัง 2569"
            className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">คะแนน (1-5)</label>
          <select value={rating} onChange={(e) => setRating(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="block text-xs font-semibold text-on-surface-variant">จุดแข็ง</label>
          <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={2} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="block text-xs font-semibold text-on-surface-variant">จุดที่ควรพัฒนา</label>
          <textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={2} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="block text-xs font-semibold text-on-surface-variant">เป้าหมายรอบถัดไป</label>
          <textarea
            value={goalsNextPeriod}
            onChange={(e) => setGoalsNextPeriod(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
