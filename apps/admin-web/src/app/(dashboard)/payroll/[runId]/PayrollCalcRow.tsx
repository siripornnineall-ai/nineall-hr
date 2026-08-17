"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { updatePayrollCalcAction } from "../actions";

interface LineItem {
  label: string;
  amount: number;
}

export interface PayrollCalcRowData {
  id: string;
  employeeCode: string;
  employeeName: string;
  baseAmount: number;
  otAmount: number;
  grossEarnings: number;
  totalDeductions: number;
  socialSecurityAmount: number;
  taxAmount: number;
  netPay: number;
  hasAnomaly: boolean;
  anomalyNotes: string | null;
  earningItems: LineItem[];
  deductionItems: LineItem[];
  payslipUrl: string | null;
}

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PayrollCalcRow({ row, editable }: { row: PayrollCalcRowData; editable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [baseAmount, setBaseAmount] = useState(String(row.baseAmount));
  const [otAmount, setOtAmount] = useState(String(row.otAmount));
  const [socialSecurityAmount, setSocialSecurityAmount] = useState(String(row.socialSecurityAmount));
  const [taxAmount, setTaxAmount] = useState(String(row.taxAmount));
  const [earningItems, setEarningItems] = useState<LineItem[]>(row.earningItems);
  const [deductionItems, setDeductionItems] = useState<LineItem[]>(row.deductionItems);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const earningItemsTotal = earningItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const deductionItemsTotal = deductionItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const previewGross = (Number(baseAmount) || 0) + (Number(otAmount) || 0) + earningItemsTotal;
  const previewDeductions = (Number(socialSecurityAmount) || 0) + (Number(taxAmount) || 0) + deductionItemsTotal;
  const previewNet = previewGross - previewDeductions;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePayrollCalcAction(row.id, { baseAmount, otAmount, socialSecurityAmount, taxAmount, earningItems, deductionItems });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  if (editing) {
    return (
      <tr>
        <td className="px-3 py-4" colSpan={11}>
          <div className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-low p-4">
            <p className="font-bold">
              {row.employeeName} ({row.employeeCode})
            </p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumberField label="เงินเดือนพื้นฐาน" value={baseAmount} onChange={setBaseAmount} />
              <NumberField label="OT" value={otAmount} onChange={setOtAmount} />
              <NumberField label="ประกันสังคม" value={socialSecurityAmount} onChange={setSocialSecurityAmount} />
              <NumberField label="ภาษี" value={taxAmount} onChange={setTaxAmount} />
            </div>

            <LineItemEditor title="รายการปรับเพิ่ม" items={earningItems} onChange={setEarningItems} tone="text-status-success" />
            <LineItemEditor title="รายการปรับลด" items={deductionItems} onChange={setDeductionItems} tone="text-status-danger" />

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-3 text-sm md:grid-cols-4">
              <div>
                <span className="text-on-surface-variant">รายได้รวม: </span>
                <span className="font-bold">{fmt(previewGross)}</span>
              </div>
              <div>
                <span className="text-on-surface-variant">รายการหักรวม: </span>
                <span className="font-bold text-status-danger">{fmt(previewDeductions)}</span>
              </div>
              <div className="col-span-2">
                <span className="text-on-surface-variant">ยอดจ่ายสุทธิ: </span>
                <span className="font-bold text-primary">{fmt(previewNet)}</span>
              </div>
            </div>

            {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {isPending ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button onClick={() => setEditing(false)} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
                ยกเลิก
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-primary/5">
      <td className="px-3 py-3">{row.employeeCode}</td>
      <td className="px-3 py-3 font-semibold">{row.employeeName}</td>
      <td className="px-3 py-3 text-right">{fmt(row.baseAmount)}</td>
      <td className="px-3 py-3 text-right text-tertiary">{fmt(row.otAmount)}</td>
      <td className="px-3 py-3 text-right">{fmt(row.grossEarnings)}</td>
      <td className="px-3 py-3 text-right text-error">{fmt(row.totalDeductions)}</td>
      <td className="px-3 py-3 text-right">{fmt(row.socialSecurityAmount)}</td>
      <td className="px-3 py-3 text-right">{fmt(row.taxAmount)}</td>
      <td className="px-3 py-3 text-right font-bold text-primary">{fmt(row.netPay)}</td>
      <td className="px-3 py-3 text-center">
        {row.hasAnomaly ? <Badge tone="danger">ตรวจสอบ</Badge> : <Badge tone="success">พร้อมจ่าย</Badge>}
        {row.anomalyNotes && <p className="mt-1 text-[10px] text-error">{row.anomalyNotes}</p>}
      </td>
      <td className="px-3 py-3 text-center">
        <div className="flex flex-col items-center gap-1">
          {row.payslipUrl ? (
            <a href={row.payslipUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-primary hover:underline">
              ดาวน์โหลด PDF
            </a>
          ) : (
            <span className="text-xs text-on-surface-variant">-</span>
          )}
          {editable && (
            <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
              แก้ไข
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-on-surface-variant">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-lg border border-outline-variant bg-white px-3 text-sm"
      />
    </div>
  );
}

function LineItemEditor({
  title,
  items,
  onChange,
  tone,
}: {
  title: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  tone: string;
}) {
  function updateItem(idx: number, field: keyof LineItem, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], [field]: field === "amount" ? Number(value) : value };
    onChange(next);
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function addItem() {
    onChange([...items, { label: "", amount: 0 }]);
  }

  return (
    <div>
      <p className={`mb-2 text-sm font-bold ${tone}`}>{title}</p>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={item.label}
              onChange={(e) => updateItem(idx, "label", e.target.value)}
              placeholder="รายการ"
              className="h-9 flex-1 rounded-lg border border-outline-variant bg-white px-3 text-sm"
            />
            <input
              type="number"
              step="0.01"
              value={item.amount}
              onChange={(e) => updateItem(idx, "amount", e.target.value)}
              className="h-9 w-32 rounded-lg border border-outline-variant bg-white px-3 text-sm"
            />
            <button onClick={() => removeItem(idx)} className="text-xs font-bold text-status-danger">
              ลบ
            </button>
          </div>
        ))}
        <button onClick={addItem} className="text-xs font-bold text-primary hover:underline">
          + เพิ่มรายการ
        </button>
      </div>
    </div>
  );
}
