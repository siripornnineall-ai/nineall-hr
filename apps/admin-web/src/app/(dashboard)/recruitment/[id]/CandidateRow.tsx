"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { decideCandidateStatusAction } from "../actions";

const STATUS_OPTIONS = [
  { value: "applied", label: "สมัครเข้ามา" },
  { value: "screening", label: "คัดกรอง" },
  { value: "interview", label: "สัมภาษณ์" },
  { value: "offer", label: "เสนองาน" },
  { value: "hired", label: "รับเข้าทำงาน" },
  { value: "rejected", label: "ไม่ผ่าน" },
] as const;

const STATUS_BADGE: Record<string, { tone: "success" | "warning" | "danger" | "info" | "neutral"; label: string }> = {
  applied: { tone: "info", label: "สมัครเข้ามา" },
  screening: { tone: "warning", label: "คัดกรอง" },
  interview: { tone: "warning", label: "สัมภาษณ์" },
  offer: { tone: "success", label: "เสนองาน" },
  hired: { tone: "success", label: "รับเข้าทำงาน" },
  rejected: { tone: "danger", label: "ไม่ผ่าน" },
};

export interface CandidateRowData {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  coverNote: string | null;
  status: string;
  createdAt: string;
}

export function CandidateRow({ row }: { row: CandidateRowData }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const badge = STATUS_BADGE[row.status] ?? { tone: "neutral" as const, label: row.status };

  function changeStatus(status: string) {
    setError(null);
    startTransition(async () => {
      const result = await decideCandidateStatusAction(row.id, status as (typeof STATUS_OPTIONS)[number]["value"]);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">{row.fullName}</td>
      <td className="px-4 py-3 text-xs">
        {row.phone && <div>{row.phone}</div>}
        {row.email && <div className="text-on-surface-variant">{row.email}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-on-surface-variant">{row.coverNote ?? "-"}</td>
      <td className="px-4 py-3">{new Date(row.createdAt).toLocaleDateString("th-TH")}</td>
      <td className="px-4 py-3">
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <select
            value={row.status}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={isPending}
            className="h-8 rounded-lg border border-outline-variant px-2 text-xs disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
