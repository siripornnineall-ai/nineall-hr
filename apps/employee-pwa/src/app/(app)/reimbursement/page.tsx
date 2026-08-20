"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface ReimbursementRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  description: string | null;
  status: string;
}

const CATEGORIES = ["เดินทาง", "ที่พัก", "อาหาร", "อุปกรณ์/เครื่องมือ", "อื่น ๆ"];

const STATUS_TH: Record<string, string> = { pending: "รออนุมัติ", approved: "อนุมัติแล้ว", rejected: "ปฏิเสธ", cancelled: "ยกเลิก" };
const STATUS_CLASS: Record<string, string> = {
  pending: "text-status-warning",
  approved: "text-status-success",
  rejected: "text-status-danger",
  cancelled: "text-on-surface-variant",
};

export default function ReimbursementPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<ReimbursementRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [expenseDate, setExpenseDate] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: reqs } = await supabase
      .from("reimbursement_requests")
      .select("id, expense_date, category, amount, description, status")
      .eq("employee_id", profile.employeeId)
      .order("expense_date", { ascending: false })
      .limit(30);
    setRequests(reqs ?? []);
    setLoaded(true);
  }, [profile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const monthKey = new Date().toISOString().slice(0, 7);
  const approvedThisMonth = requests
    .filter((r) => r.status === "approved" && r.expense_date.slice(0, 7) === monthKey)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    const amountNum = Number(amount);
    if (!expenseDate || !Number.isFinite(amountNum) || amountNum <= 0) {
      setError("กรุณาระบุวันที่และจำนวนเงินให้ถูกต้อง");
      return;
    }
    setSubmitting(true);

    let receiptPath: string | null = null;
    if (receiptFile) {
      setUploadingReceipt(true);
      const path = `${profile!.orgId}/${profile!.employeeId}/${Date.now()}-${receiptFile.name}`;
      const { error: uploadError } = await supabase.storage.from("attachments").upload(path, receiptFile, { contentType: receiptFile.type });
      setUploadingReceipt(false);
      if (uploadError) {
        setSubmitting(false);
        setError(`อัปโหลดใบเสร็จไม่สำเร็จ: ${uploadError.message}`);
        return;
      }
      receiptPath = path;
    }

    const { error: insertError } = await supabase.from("reimbursement_requests").insert({
      org_id: profile!.orgId,
      employee_id: profile!.employeeId,
      expense_date: expenseDate,
      category,
      amount: amountNum,
      description: description || null,
      receipt_file_path: receiptPath,
      status: "pending",
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setExpenseDate("");
    setAmount("");
    setDescription("");
    setReceiptFile(null);
    setSuccess("ส่งคำขอเบิกค่าใช้จ่ายเรียบร้อยแล้ว");
    load();
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">เบิกค่าใช้จ่ายคืน</h1>

      <div className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-xs text-on-surface-variant">ยอดที่อนุมัติแล้วเดือนนี้</p>
        <p className="mt-1 text-xl font-bold text-primary">{approvedThisMonth.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</p>
      </div>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold text-on-surface-variant">ขอเบิกค่าใช้จ่ายคืน</p>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วันที่จ่ายเงิน</label>
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">หมวดหมู่</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">จำนวนเงิน (บาท)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">รายละเอียด (ไม่บังคับ)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="ระบุรายละเอียดค่าใช้จ่าย"
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">ใบเสร็จ (ไม่บังคับ)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
          {receiptFile && <p className="mt-1 text-xs text-on-surface-variant">{receiptFile.name}</p>}
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}
        <button onClick={handleSubmit} disabled={submitting} className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
          {submitting ? (uploadingReceipt ? "กำลังอัปโหลด..." : "กำลังส่ง...") : "ส่งคำขอเบิกค่าใช้จ่าย"}
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-base font-bold text-on-surface">ประวัติการเบิก</h2>
        {loaded && requests.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประวัติการเบิกค่าใช้จ่าย</p>}
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
              <div>
                <p className="font-semibold text-on-surface">{new Date(r.expense_date).toLocaleDateString("th-TH")}</p>
                <p className="text-xs text-on-surface-variant">
                  {r.category} — {Number(r.amount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                </p>
              </div>
              <span className={clsx("text-xs font-bold", STATUS_CLASS[r.status])}>{STATUS_TH[r.status] ?? r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
