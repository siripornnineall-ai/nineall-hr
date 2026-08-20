"use client";

import { useState } from "react";
import { generateCertificateAction } from "./actions";

function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CertificatePage() {
  const [showSalary, setShowSalary] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    setSuccess(null);
    setGenerating(true);
    const result = await generateCertificateAction(showSalary, purpose);
    setGenerating(false);
    if (result.error || !result.base64) {
      setError(result.error ?? "สร้างเอกสารไม่สำเร็จ");
      return;
    }
    downloadBase64Pdf(result.base64, result.filename ?? "certificate.pdf");
    setSuccess("ออกหนังสือรับรองการทำงานเรียบร้อยแล้ว");
  }

  return (
    <div className="safe-top space-y-5 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ขอหนังสือรับรองการทำงาน</h1>

      <div className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <p className="text-sm text-on-surface-variant">
          ระบบจะออกหนังสือรับรองการทำงานให้ทันที (PDF) โดยใช้ข้อมูลตำแหน่ง แผนก และวันที่เริ่มงานปัจจุบันของคุณ
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showSalary} onChange={(e) => setShowSalary(e.target.checked)} className="h-4 w-4 accent-primary" />
          แสดงเงินเดือน/อัตราค่าจ้างในเอกสาร
        </label>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-on-surface-variant">วัตถุประสงค์ (ไม่บังคับ)</label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="เช่น การขอวีซ่า, การขอสินเชื่อธนาคาร"
            className="w-full rounded-xl border border-outline-variant px-3 py-2.5 text-sm"
          />
        </div>
        {error && <p className="text-sm text-status-danger">{error}</p>}
        {success && <p className="text-sm font-semibold text-status-success">{success}</p>}
        <button onClick={handleGenerate} disabled={generating} className="h-12 w-full rounded-2xl bg-primary font-bold text-white disabled:opacity-60">
          {generating ? "กำลังสร้างเอกสาร..." : "ออกหนังสือรับรอง (PDF)"}
        </button>
      </div>
    </div>
  );
}
