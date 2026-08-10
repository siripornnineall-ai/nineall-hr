"use client";

import { useActionState } from "react";
import { createAnnouncementAction, type AnnouncementActionState } from "./actions";

const initialState: AnnouncementActionState = {};

export function NewAnnouncementForm() {
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, initialState);

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <h3 className="font-bold">สร้างประกาศใหม่</h3>
      {state.error && <div className="rounded-lg bg-error-container px-4 py-2 text-sm text-on-error-container">{state.error}</div>}
      <input name="title" required placeholder="หัวข้อประกาศ" className="h-11 w-full rounded-lg border border-outline-variant px-3 text-sm" />
      <textarea name="body" required rows={3} placeholder="เนื้อหาประกาศ" className="w-full rounded-lg border border-outline-variant p-3 text-sm" />
      <select name="targetType" className="h-11 rounded-lg border border-outline-variant px-3 text-sm">
        <option value="all">ทุกคน</option>
        <option value="department">เฉพาะแผนก</option>
        <option value="team">เฉพาะทีม</option>
      </select>
      <button type="submit" disabled={isPending} className="flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-bold text-white disabled:opacity-50">
        <span className="material-symbols-outlined text-sm">add</span>
        {isPending ? "กำลังบันทึก..." : "สร้างประกาศ"}
      </button>
    </form>
  );
}
