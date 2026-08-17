"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { deletePayrollRunAction, updatePayrollRunAction } from "./actions";

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "neutral" | "info"; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  under_review: { tone: "info", label: "Under Review" },
  pending_approval: { tone: "warning", label: "Pending Approval" },
  approved: { tone: "success", label: "Approved" },
  paid: { tone: "success", label: "Paid" },
  locked: { tone: "neutral", label: "Locked" },
};

export interface PayrollRunRowData {
  id: string;
  status: string;
  employeeCount: number;
  totalNetAmount: number;
  label: string;
  periodStart: string;
  periodEnd: string;
}

export function PayrollRunRow({ row }: { row: PayrollRunRowData }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [periodStart, setPeriodStart] = useState(row.periodStart);
  const [periodEnd, setPeriodEnd] = useState(row.periodEnd);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };
  const editable = row.status === "draft" || row.status === "under_review";

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePayrollRunAction(row.id, { label, periodStart, periodEnd });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  function remove() {
    if (!confirm(`ลบรอบเงินเดือน "${row.label}" ใช่หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePayrollRunAction(row.id);
      if (result?.error) setError(result.error);
    });
  }

  if (editing) {
    return (
      <tr>
        <td className="px-4 py-3" colSpan={5}>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อรอบ</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันเริ่มรอบ</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-on-surface-variant">วันสิ้นสุดรอบ</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-9 rounded-lg border border-outline-variant px-2 text-sm" />
            </div>
            <button onClick={save} disabled={isPending} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-white disabled:opacity-60">
              {isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button onClick={() => setEditing(false)} disabled={isPending} className="h-9 rounded-lg px-3 text-xs font-semibold text-on-surface-variant">
              ยกเลิก
            </button>
            {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        <Link href={`/payroll/${row.id}`} className="hover:text-primary hover:underline">
          {row.label}
        </Link>
      </td>
      <td className="px-4 py-3">{row.employeeCount}</td>
      <td className="px-4 py-3">{row.totalNetAmount.toLocaleString("th-TH")} บาท</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-3">
          {editable && (
            <>
              <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
                แก้ไข
              </button>
              <button onClick={remove} disabled={isPending} className="text-xs font-bold text-status-danger hover:underline disabled:opacity-60">
                ลบ
              </button>
            </>
          )}
          <Link href={`/payroll/${row.id}`} className="text-xs font-bold text-primary">
            ดูรายละเอียด
          </Link>
        </div>
        {error && <p className="mt-1 text-xs font-semibold text-status-danger">{error}</p>}
      </td>
    </tr>
  );
}
