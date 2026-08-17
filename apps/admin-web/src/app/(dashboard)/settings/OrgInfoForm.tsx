"use client";

import { useState, useTransition } from "react";
import { updateOrganizationAction } from "./actions";

export function OrgInfoForm({ name, timezone }: { name: string; timezone: string }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name, timezone });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold">ข้อมูลบริษัท</h3>
          <button onClick={() => setEditing(true)} className="text-xs font-bold text-primary hover:underline">
            แก้ไข
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-on-surface-variant">ชื่อบริษัท</dt>
            <dd className="font-semibold">{name}</dd>
          </div>
          <div>
            <dt className="text-xs text-on-surface-variant">เขตเวลา</dt>
            <dd className="font-semibold">{timezone}</dd>
          </div>
        </dl>
      </section>
    );
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await updateOrganizationAction(values);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <section className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-bold">ข้อมูลบริษัท</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">ชื่อบริษัท</label>
          <input
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-on-surface-variant">เขตเวลา</label>
          <input
            value={values.timezone}
            onChange={(e) => setValues({ ...values, timezone: e.target.value })}
            className="w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-status-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={() => setEditing(false)} disabled={isPending} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant">
          ยกเลิก
        </button>
        <button onClick={submit} disabled={isPending} className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </div>
    </section>
  );
}
