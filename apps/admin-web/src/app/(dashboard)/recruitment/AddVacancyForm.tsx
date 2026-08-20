"use client";

import { useState, useTransition } from "react";
import { createVacancyAction } from "./actions";

interface DepartmentOption {
  id: string;
  name: string;
}
interface PositionOption {
  id: string;
  title: string;
  department_id: string | null;
}

export function AddVacancyForm({ departments, positions }: { departments: DepartmentOption[]; positions: PositionOption[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobPositionId, setJobPositionId] = useState("");
  const [description, setDescription] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const positionsInDepartment = departmentId ? positions.filter((p) => p.department_id === departmentId) : positions;

  function reset() {
    setTitle("");
    setDepartmentId("");
    setJobPositionId("");
    setDescription("");
    setHeadcount("1");
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createVacancyAction({ title, departmentId, jobPositionId, description, headcount });
      if (result?.error) setError(result.error);
      else {
        reset();
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
        + เปิดรับสมัครตำแหน่งใหม่
      </button>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
      <p className="text-sm font-bold text-on-surface">เปิดรับสมัครตำแหน่งใหม่</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">ชื่อตำแหน่งงาน</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">แผนก</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- ไม่ระบุ --</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">ตำแหน่ง</label>
          <select value={jobPositionId} onChange={(e) => setJobPositionId(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm">
            <option value="">-- ไม่ระบุ --</option>
            {positionsInDepartment.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-on-surface-variant">จำนวนที่รับ</label>
          <input type="number" min="1" value={headcount} onChange={(e) => setHeadcount(e.target.value)} className="h-10 w-full rounded-lg border border-outline-variant px-3 text-sm" />
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="block text-xs font-semibold text-on-surface-variant">รายละเอียดงาน (ไม่บังคับ)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm" />
        </div>
      </div>
      {error && <p className="text-sm font-semibold text-status-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={submit} disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "เปิดรับสมัคร"}
        </button>
        <button
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={isPending}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
