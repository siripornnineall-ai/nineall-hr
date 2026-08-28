"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { updatePayrollCalcAction, deletePayrollCalcAction } from "../actions";

interface LineItem {
  label: string;
  amount: number;
}

export interface PayrollCalcRowData {
  id: string;
  employeeCode: string;
  employeeName: string;
  employeePhotoUrl: string | null;
  baseAmount: number;
  otAmount: number;
  grossEarnings: number;
  totalDeductions: number;
  socialSecurityAmount: number;
  socialSecurityAutoCalc: boolean;
  taxAmount: number;
  wht40_1Amount: number;
  wht40_2Amount: number;
  netPay: number;
  hasAnomaly: boolean;
  anomalyNotes: string | null;
  earningItems: LineItem[];
  deductionItems: LineItem[];
  payslipUrl: string | null;
}

export interface SsPolicy {
  employeeRate: number;
  minBase: number;
  maxContribution: number;
}

// Always shown on the "รายการปรับลด" side, in this order, even at zero — matches the
// deduction types HR actually tracks every run. Anything beyond these four is a genuine
// one-off, added via "+ เพิ่มรายการปรับลด".
const DEDUCTION_PRESETS = ["หักขาด/ลา/มาสาย", "เงินหักอื่นๆ", "หักลาไม่รับค่าจ้าง", "เงินเบิกล่วงหน้า"];

function seedDeductionItems(items: LineItem[]): LineItem[] {
  const byLabel = new Map(items.map((i) => [i.label, i.amount]));
  const presetRows = DEDUCTION_PRESETS.map((label) => ({ label, amount: byLabel.get(label) ?? 0 }));
  const extraRows = items.filter((i) => !DEDUCTION_PRESETS.includes(i.label));
  return [...presetRows, ...extraRows];
}

function computeAutoSocialSecurity(baseAmount: number, policy: SsPolicy): number {
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) return 0;
  const cappedBase = Math.max(policy.minBase, Math.min(baseAmount, policy.employeeRate > 0 ? policy.maxContribution / policy.employeeRate : baseAmount));
  return Math.round(Math.min(cappedBase * policy.employeeRate, policy.maxContribution) * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PayrollCalcRow({ row, ssPolicy }: { row: PayrollCalcRowData; ssPolicy: SsPolicy }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [baseAmount, setBaseAmount] = useState(String(row.baseAmount));
  const [otAmount, setOtAmount] = useState(String(row.otAmount));
  const [socialSecurityAmount, setSocialSecurityAmount] = useState(String(row.socialSecurityAmount));
  const [socialSecurityAutoCalc, setSocialSecurityAutoCalc] = useState(row.socialSecurityAutoCalc);
  const [wht40_1Amount, setWht40_1Amount] = useState(String(row.wht40_1Amount));
  const [wht40_2Amount, setWht40_2Amount] = useState(String(row.wht40_2Amount));
  const [earningItems, setEarningItems] = useState<LineItem[]>(row.earningItems);
  const [deductionItems, setDeductionItems] = useState<LineItem[]>(() => seedDeductionItems(row.deductionItems));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateBaseAmount(value: string) {
    setBaseAmount(value);
    if (socialSecurityAutoCalc) {
      setSocialSecurityAmount(String(computeAutoSocialSecurity(Number(value) || 0, ssPolicy)));
    }
  }

  function toggleSocialSecurityAutoCalc(checked: boolean) {
    setSocialSecurityAutoCalc(checked);
    if (checked) {
      setSocialSecurityAmount(String(computeAutoSocialSecurity(Number(baseAmount) || 0, ssPolicy)));
    }
  }

  const earningItemsTotal = earningItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const deductionItemsTotal = deductionItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  // otAmount isn't added separately — the engine always includes OT as its own row inside
  // earningItems ("ค่าล่วงเวลา (OT)"), so summing both here would double it. otAmount is kept
  // only as the figure shown in the outer table's "OT" column / used on the payslip.
  const previewGross = (Number(baseAmount) || 0) + earningItemsTotal;
  const previewTax = (Number(wht40_1Amount) || 0) + (Number(wht40_2Amount) || 0);
  const previewDeductions = (Number(socialSecurityAmount) || 0) + previewTax + deductionItemsTotal;
  const previewNet = previewGross - previewDeductions;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updatePayrollCalcAction(row.id, {
        baseAmount,
        otAmount,
        socialSecurityAmount,
        socialSecurityAutoCalc,
        wht40_1Amount,
        wht40_2Amount,
        earningItems,
        deductionItems,
      });
      if (result?.error) setError(result.error);
      else setEditing(false);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deletePayrollCalcAction(row.id);
      if (result?.error) setError(result.error);
    });
  }

  if (editing) {
    return (
      <tr>
        <td className="px-3 py-4" colSpan={11}>
          <div className="mx-auto max-w-xl space-y-5 rounded-2xl border border-outline-variant bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-bold">ข้อมูลเงินเดือน/ค่าจ้าง</p>
                <p className="text-xs text-on-surface-variant">
                  {row.employeeName} ({row.employeeCode})
                </p>
              </div>
              <button onClick={() => setEditing(false)} disabled={isPending} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <FieldRow label="เงินเดือน:" value={baseAmount} onChange={updateBaseAmount} />
              <FieldRow label="ค่าล่วงเวลารวม (OT):" value={otAmount} onChange={setOtAmount} />

              <div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-sm text-on-surface-variant">
                    ประกันสังคม:
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant" title="คำนวณตามอัตราและเพดานที่ตั้งไว้ในระบบ">
                      info
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={socialSecurityAmount}
                    onChange={(e) => setSocialSecurityAmount(e.target.value)}
                    disabled={socialSecurityAutoCalc}
                    className="h-9 w-36 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-right text-sm disabled:bg-surface-container disabled:text-on-surface-variant"
                  />
                </div>
                <label className="mt-1.5 flex items-center justify-end gap-1.5 text-xs text-on-surface-variant">
                  <input type="checkbox" checked={socialSecurityAutoCalc} onChange={(e) => toggleSocialSecurityAutoCalc(e.target.checked)} />
                  คำนวณประกันสังคมอัตโนมัติ
                </label>
              </div>

              <FieldRow label="หัก ณ ที่จ่าย 40(1):" value={wht40_1Amount} onChange={setWht40_1Amount} />
              <FieldRow label="หัก ณ ที่จ่าย 40(2):" value={wht40_2Amount} onChange={setWht40_2Amount} />
              <p className="rounded-lg bg-surface-container-low p-3 text-xs leading-relaxed text-on-surface-variant">
                <span className="material-symbols-outlined mr-1 align-text-bottom text-[14px]">info</span>
                ยอดหัก ณ ที่จ่าย 40(1) ระบบคำนวณให้อัตโนมัติจากฐานเงินเดือนของพนักงานเท่านั้น หากจ่ายผลประโยชน์อื่น สามารถคำนวณเองและกรอกที่ช่องหัก ณ ที่จ่าย 40(1) และ (2)
              </p>
            </div>

            <LineItemEditor title="รายการปรับเพิ่ม" items={earningItems} onChange={setEarningItems} tone="text-status-success" addLabel="+ เพิ่มรายการปรับเพิ่ม" />
            <LineItemEditor
              title="รายการปรับลด"
              items={deductionItems}
              onChange={setDeductionItems}
              tone="text-status-danger"
              addLabel="+ เพิ่มรายการปรับลด"
              lockedLabels={DEDUCTION_PRESETS}
            />

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container-low p-3 text-sm">
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
      <td className="px-3 py-3 font-semibold">
        <div className="flex items-center gap-2">
          <Avatar url={row.employeePhotoUrl} size={26} />
          {row.employeeName}
        </div>
      </td>
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
          <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
            แก้ไข
          </button>
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-status-danger">ลบแน่ใจ?</span>
              <button onClick={remove} disabled={isPending} className="text-xs font-bold text-status-danger hover:underline">
                ยืนยัน
              </button>
              <button onClick={() => setConfirmingDelete(false)} disabled={isPending} className="text-xs font-semibold text-on-surface-variant hover:underline">
                ยกเลิก
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmingDelete(true)} className="text-xs font-bold text-status-danger hover:underline">
              ลบ
            </button>
          )}
          {error && <p className="text-[10px] text-status-danger">{error}</p>}
        </div>
      </td>
    </tr>
  );
}

function FieldRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-on-surface-variant">{label}</label>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-36 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-right text-sm"
      />
    </div>
  );
}

function LineItemEditor({
  title,
  items,
  onChange,
  tone,
  addLabel,
  lockedLabels,
}: {
  title: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  tone: string;
  addLabel: string;
  lockedLabels?: string[];
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
        {items.map((item, idx) => {
          const locked = lockedLabels?.includes(item.label);
          return (
            <div key={idx} className="flex items-center gap-2">
              {locked ? (
                <span className="flex-1 text-sm text-on-surface-variant">{item.label}</span>
              ) : (
                <input
                  value={item.label}
                  onChange={(e) => updateItem(idx, "label", e.target.value)}
                  placeholder="รายการ"
                  className="h-9 flex-1 rounded-lg border border-outline-variant bg-white px-3 text-sm"
                />
              )}
              <input
                type="number"
                step="0.01"
                value={item.amount}
                onChange={(e) => updateItem(idx, "amount", e.target.value)}
                className="h-9 w-32 rounded-lg border border-outline-variant bg-surface-container-low px-3 text-right text-sm"
              />
              {!locked && (
                <button onClick={() => removeItem(idx)} className="text-xs font-bold text-status-danger">
                  ลบ
                </button>
              )}
            </div>
          );
        })}
        <button onClick={addItem} className="text-xs font-bold text-primary hover:underline">
          {addLabel}
        </button>
      </div>
    </div>
  );
}
