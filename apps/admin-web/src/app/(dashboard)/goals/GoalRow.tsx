"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { GoalEditor } from "./GoalEditor";
import { deleteGoalAction, updateGoalAction } from "./actions";

export interface GoalData {
  id: string;
  employeeId: string;
  kind: "goal" | "kpi";
  title: string;
  description: string | null;
  targetValue: string | null;
  currentValue: string | null;
  period: string | null;
  dueDate: string | null;
  status: "active" | "done" | "cancelled";
  source: "employee" | "admin";
}

const STATUS: Record<string, { tone: "success" | "warning" | "danger" | "neutral"; label: string }> = {
  active: { tone: "warning", label: "กำลังดำเนินการ" },
  done: { tone: "success", label: "สำเร็จแล้ว" },
  cancelled: { tone: "neutral", label: "ยกเลิก" },
};

export function GoalRow({ goal, canManage }: { goal: GoalData; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const status = STATUS[goal.status] ?? STATUS.active;

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await deleteGoalAction(goal.id);
      if (result?.error) setError(result.error);
      else setConfirming(false);
    });
  }

  if (editing) {
    return (
      <GoalEditor
        fixedEmployeeId={goal.employeeId}
        initial={{
          kind: goal.kind,
          title: goal.title,
          description: goal.description ?? "",
          targetValue: goal.targetValue ?? "",
          currentValue: goal.currentValue ?? "",
          period: goal.period ?? "",
          dueDate: goal.dueDate ?? "",
          status: goal.status,
        }}
        submitLabel="บันทึกการแก้ไข"
        onSubmit={(values) => updateGoalAction(goal.id, values)}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-outline-variant p-3">
      <div className="min-w-[220px] flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={goal.kind === "kpi" ? "success" : "neutral"}>{goal.kind === "kpi" ? "KPI" : "เป้าหมาย"}</Badge>
          <span className="font-semibold text-on-surface">{goal.title}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-xs text-on-surface-variant">{goal.source === "admin" ? "ผู้ดูแลกำหนด" : "พนักงานตั้งเอง"}</span>
        </div>
        <div className="text-sm text-on-surface-variant">
          {goal.targetValue && <span>เป้า: <b className="text-on-surface">{goal.targetValue}</b></span>}
          {goal.currentValue && <span>{goal.targetValue ? " · " : ""}ตอนนี้: <b className="text-on-surface">{goal.currentValue}</b></span>}
          {goal.period && <span> · {goal.period}</span>}
          {goal.dueDate && <span> · ภายใน {new Date(goal.dueDate).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}</span>}
        </div>
        {goal.description && <p className="whitespace-pre-line text-sm text-on-surface-variant">{goal.description}</p>}
        {error && <p className="text-xs font-semibold text-status-danger">{error}</p>}
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <span className="text-xs font-semibold text-status-danger">ลบรายการนี้?</span>
              <button onClick={remove} disabled={isPending} className="rounded-lg bg-status-danger px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                {isPending ? "กำลังลบ..." : "ยืนยันลบ"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={isPending} className="text-xs font-semibold text-on-surface-variant">
                ยกเลิก
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">
                แก้ไข
              </button>
              <button onClick={() => setConfirming(true)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-bold text-status-danger hover:bg-status-danger/10">
                ลบ
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
