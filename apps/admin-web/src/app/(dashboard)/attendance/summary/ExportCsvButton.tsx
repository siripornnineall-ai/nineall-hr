"use client";

// Downloads the summary table as a CSV that opens correctly in Excel (UTF-8 BOM for Thai text).
export function ExportCsvButton({ rows, filename }: { rows: string[][]; filename: string }) {
  function download() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button onClick={download} className="flex items-center gap-1 rounded-lg border border-primary px-3 py-2 text-sm font-bold text-primary hover:bg-primary/5">
      <span className="material-symbols-outlined text-[18px]">download</span>
      ดาวน์โหลด CSV
    </button>
  );
}
