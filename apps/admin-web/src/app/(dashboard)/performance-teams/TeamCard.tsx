"use client";

import { useState, useTransition } from "react";
import { addTeamMemberAction, removeTeamMemberAction, setManagedPagesAction, setTeamLeadAction } from "./actions";

const PAGE_OPTIONS = ["Issa Apparel", "Fasonaf", "Active"];

interface Member {
  id: string;
  employeeId: string;
  isLead: boolean;
  managedPages: string[];
  name: string;
  employeeCode: string;
}

interface Team {
  id: string;
  slug: string;
  name: string;
  shift_end_time: string | null;
  notify_enabled: boolean;
}

export function TeamCard({ team, members, employees }: { team: Team; members: Member[]; employees: { id: string; name: string }[] }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [isLead, setIsLead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableEmployees = employees.filter((e) => !members.some((m) => m.employeeId === e.id));

  function handleAdd() {
    if (!selectedEmployeeId) return;
    setError(null);
    startTransition(async () => {
      const result = await addTeamMemberAction(team.id, selectedEmployeeId, isLead);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSelectedEmployeeId("");
      setIsLead(false);
    });
  }

  return (
    <div className="rounded-xl border border-outline-variant bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-on-surface">{team.name}</h3>
          <p className="text-xs text-on-surface-variant">
            {team.shift_end_time ? `เลิกงาน ${team.shift_end_time.slice(0, 5)} น. — แจ้งเตือนก่อนเลิกงาน 10 นาที` : "ยังไม่ได้ตั้งเวลาแจ้งเตือน"}
          </p>
        </div>
        <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">{members.length} คน</span>
      </div>

      <div className="space-y-2">
        {members.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีสมาชิกในทีมนี้</p>}
        {members.map((m) => (
          <div key={m.id} className="rounded-lg border border-outline-variant p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-on-surface">{m.name}</p>
                <p className="text-xs text-on-surface-variant">{m.employeeCode}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
                  <input
                    type="checkbox"
                    checked={m.isLead}
                    onChange={(e) => startTransition(() => setTeamLeadAction(m.id, e.target.checked))}
                  />
                  หัวหน้าทีม
                </label>
                <button
                  onClick={() => startTransition(() => removeTeamMemberAction(m.id))}
                  className="rounded-lg border border-status-danger px-2.5 py-1 text-xs font-semibold text-status-danger"
                >
                  ลบออก
                </button>
              </div>
            </div>
            {team.slug === "content" && (
              <div className="mt-2 flex flex-wrap gap-3 border-t border-outline-variant pt-2">
                {PAGE_OPTIONS.map((page) => (
                  <label key={page} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={m.managedPages.includes(page)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...m.managedPages, page] : m.managedPages.filter((p) => p !== page);
                        startTransition(() => setManagedPagesAction(m.id, next));
                      }}
                    />
                    ดูแลเพจ {page}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="mt-3 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</div>}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant pt-4">
        <select
          value={selectedEmployeeId}
          onChange={(e) => setSelectedEmployeeId(e.target.value)}
          className="h-10 flex-1 rounded-lg border border-outline-variant px-3 text-sm"
        >
          <option value="">-- เลือกพนักงานเพื่อเพิ่มเข้าทีม --</option>
          {availableEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-on-surface-variant">
          <input type="checkbox" checked={isLead} onChange={(e) => setIsLead(e.target.checked)} />
          เป็นหัวหน้าทีม
        </label>
        <button
          onClick={handleAdd}
          disabled={isPending || !selectedEmployeeId}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white disabled:opacity-60"
        >
          เพิ่ม
        </button>
      </div>
    </div>
  );
}
