"use client";

import { useState } from "react";

export function CopyApplyLink({ vacancyId }: { vacancyId: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/apply/${vacancyId}` : `/apply/${vacancyId}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the link is still shown as selectable text
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2">
      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">link</span>
      <input readOnly value={url} className="flex-1 bg-transparent text-xs text-on-surface-variant outline-none" onFocus={(e) => e.target.select()} />
      <button onClick={copy} className="text-xs font-bold text-primary hover:underline">
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
      </button>
    </div>
  );
}
