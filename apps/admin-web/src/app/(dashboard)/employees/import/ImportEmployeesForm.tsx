"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  downloadEmployeeImportTemplateAction,
  parseEmployeeImportFileAction,
  bulkImportEmployeesAction,
  type ImportRowResult,
  type ImportRowData,
  type BulkImportRowOutcome,
} from "./actions";

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportEmployeesForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ImportRowResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [outcomes, setOutcomes] = useState<BulkImportRowOutcome[] | null>(null);

  async function handleDownloadTemplate() {
    setDownloading(true);
    const result = await downloadEmployeeImportTemplateAction();
    setDownloading(false);
    if (result.base64 && result.filename) {
      downloadBase64File(result.base64, result.filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows(null);
    setOutcomes(null);
    setError(null);
    setParsing(true);
    const formData = new FormData();
    formData.append("file", file);
    const result = await parseEmployeeImportFileAction(formData);
    setParsing(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows(result.rows ?? []);
  }

  async function handleImport() {
    if (!rows) return;
    const validData = rows.filter((r) => r.valid && r.data).map((r) => r.data!) as ImportRowData[];
    if (validData.length === 0) return;
    setImporting(true);
    setError(null);
    const result = await bulkImportEmployeesAction(validData);
    setImporting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOutcomes(result.outcomes ?? []);
  }

  const validCount = rows?.filter((r) => r.valid).length ?? 0;
  const invalidCount = (rows?.length ?? 0) - validCount;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
        <h3 className="font-bold">ขั้นที่ 1 — ดาวน์โหลดเทมเพลต</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          ดาวน์โหลดไฟล์ Excel เทมเพลต กรอกข้อมูลพนักงานทีละแถว (แผนก/ตำแหน่งต้องสะกดตรงกับที่มีอยู่ในระบบ) แล้วอัปโหลดกลับมาที่นี่
        </p>
        <button
          onClick={handleDownloadTemplate}
          disabled={downloading}
          className="mt-3 flex h-11 items-center gap-2 rounded-lg border border-primary px-4 text-sm font-bold text-primary hover:bg-primary/5 disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          {downloading ? "กำลังสร้างไฟล์..." : "ดาวน์โหลดเทมเพลต Excel"}
        </button>
      </div>

      <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
        <h3 className="font-bold">ขั้นที่ 2 — อัปโหลดไฟล์ที่กรอกแล้ว</h3>
        <div className="mt-3 flex items-center gap-3">
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            {parsing ? "กำลังตรวจสอบไฟล์..." : "เลือกไฟล์ Excel"}
          </button>
          {fileName && <span className="text-sm text-on-surface-variant">{fileName}</span>}
        </div>
        {error && <div className="mt-3 rounded-lg bg-error-container px-4 py-2 text-sm text-on-error-container">{error}</div>}
      </div>

      {rows && rows.length > 0 && !outcomes && (
        <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          <h3 className="font-bold">ขั้นที่ 3 — ตรวจสอบและนำเข้า</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            พบ {rows.length} แถว — พร้อมนำเข้า <span className="font-bold text-status-success">{validCount} คน</span>
            {invalidCount > 0 && (
              <>
                {" "}
                มีปัญหา <span className="font-bold text-status-danger">{invalidCount} แถว</span> (จะไม่ถูกนำเข้า)
              </>
            )}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container">
                  <th className="px-3 py-2 font-bold text-on-surface-variant">แถว</th>
                  <th className="px-3 py-2 font-bold text-on-surface-variant">รหัส</th>
                  <th className="px-3 py-2 font-bold text-on-surface-variant">ชื่อ-นามสกุล</th>
                  <th className="px-3 py-2 font-bold text-on-surface-variant">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {rows.map((r) => (
                  <tr key={r.rowNumber}>
                    <td className="px-3 py-2">{r.rowNumber}</td>
                    <td className="px-3 py-2">{r.employeeCode || "-"}</td>
                    <td className="px-3 py-2">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-3 py-2">
                      {r.valid ? (
                        <span className="font-semibold text-status-success">พร้อมนำเข้า</span>
                      ) : (
                        <span className="text-status-danger">{r.errors.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={handleImport}
            disabled={importing || validCount === 0}
            className="mt-4 flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-white disabled:opacity-60"
          >
            {importing ? "กำลังนำเข้า..." : `นำเข้าพนักงาน ${validCount} คน`}
          </button>
        </div>
      )}

      {outcomes && (
        <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
          <h3 className="font-bold">ผลการนำเข้า</h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            สำเร็จ <span className="font-bold text-status-success">{outcomes.filter((o) => o.success).length} คน</span>
            {" / "}
            ไม่สำเร็จ <span className="font-bold text-status-danger">{outcomes.filter((o) => !o.success).length} คน</span>
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {outcomes.map((o, idx) => (
              <li key={idx} className={o.success ? "text-status-success" : "text-status-danger"}>
                {o.employeeCode}: {o.success ? "สำเร็จ" : "ไม่สำเร็จ"}
                {o.error && ` — ${o.error}`}
              </li>
            ))}
          </ul>
          <Link href="/employees" className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">
            ไปที่รายชื่อพนักงาน
          </Link>
        </div>
      )}
    </div>
  );
}
