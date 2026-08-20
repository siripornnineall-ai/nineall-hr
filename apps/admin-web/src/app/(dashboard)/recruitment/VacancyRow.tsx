"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { updateVacancyStatusAction } from "./actions";

export interface VacancyRowData {
  id: string;
  title: string;
  departmentName: string | null;
  headcount: number;
  status: "open" | "closed";
  candidateCount: number;
}

export function VacancyRow({ row }: { row: VacancyRowData }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleStatus() {
    setError(null);
    startTransition(async () => {
      const result = await updateVacancyStatusAction(row.id, row.status === "open" ? "closed" : "open");
      if (result?.error) setError(result.error);
    });
  }

  return (
    <tr>
      <td className="px-4 py-3 font-semibold">
        <Link href={`/recruitment/${row.id}`} className="text-primary hover:underline">
          {row.title}
        </Link>
      </td>
      <td className="px-4 py-3">{row.departmentName ?? "-"}</td>
      <td className="px-4 py-3 text-center">{row.headcount}</td>
      <td className="px-4 py-3 text-center">{row.candidateCount}</td>
      <td className="px-4 py-3">
        <Badge tone={row.status === "open" ? "success" : "neutral"}>{row.status === "open" ? "เปิดรับ" : "ปิดรับแล้ว"}</Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-end gap-1">
          <button onClick={toggleStatus} disabled={isPending} className="text-xs font-bold text-primary hover:underline disabled:opacity-60">
            {row.status === "open" ? "ปิดรับสมัคร" : "เปิดรับอีกครั้ง"}
          </button>
          {error && <span className="text-xs font-semibold text-status-danger">{error}</span>}
        </div>
      </td>
    </tr>
  );
}
