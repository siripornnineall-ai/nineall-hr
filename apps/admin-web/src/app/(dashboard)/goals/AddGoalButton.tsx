"use client";

import { useState } from "react";
import { GoalEditor, type EmployeeOption } from "./GoalEditor";
import { createGoalAction } from "./actions";

export function AddGoalButton({ employees, defaultEmployeeId }: { employees: EmployeeOption[]; defaultEmployeeId?: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
        + เพิ่มเป้าหมาย / KPI ให้พนักงาน
      </button>
    );
  }
  return (
    <GoalEditor
      employees={employees}
      initial={{ employeeId: defaultEmployeeId ?? "" }}
      submitLabel="เพิ่มรายการ"
      onSubmit={(values) => createGoalAction(values)}
      onDone={() => setOpen(false)}
    />
  );
}
