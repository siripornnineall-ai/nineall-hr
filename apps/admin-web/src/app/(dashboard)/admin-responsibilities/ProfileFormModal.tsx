"use client";

import { useState, useTransition } from "react";
import type { ChannelOption, EmployeeOption, ProfileData } from "./types";
import { saveProfileAction, type ScheduleInput } from "./actions";

interface ScheduleDraft extends ScheduleInput {
  key: string;
}

let draftKeySeq = 0;
function newDraftKey() {
  draftKeySeq += 1;
  return `d${draftKeySeq}`;
}

export function ProfileFormModal({
  profile,
  employees,
  channels,
  onClose,
}: {
  profile: ProfileData | null;
  employees: EmployeeOption[];
  channels: ChannelOption[];
  onClose: () => void;
}) {
  const [employeeId, setEmployeeId] = useState(profile?.employeeId ?? "");
  const [shiftLabel, setShiftLabel] = useState(profile?.shiftLabel ?? "");
  const [duties, setDuties] = useState(profile ? profile.duties.join("\n") : "");
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(
    profile && profile.schedules.length > 0
      ? profile.schedules.map((s) => ({ key: newDraftKey(), channelId: s.channel_id, workDays: s.work_days, startTime: s.start_time.slice(0, 5), endTime: s.end_time.slice(0, 5) }))
      : [{ key: newDraftKey(), channelId: "", workDays: "จันทร์ - เสาร์", startTime: "08:30", endTime: "17:30" }]
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateSchedule(key: string, patch: Partial<ScheduleDraft>) {
    setSchedules((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function addSchedule() {
    setSchedules((prev) => [...prev, { key: newDraftKey(), channelId: "", workDays: "จันทร์ - เสาร์", startTime: "08:30", endTime: "17:30" }]);
  }

  function removeSchedule(key: string) {
    setSchedules((prev) => prev.filter((s) => s.key !== key));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await saveProfileAction({
        profileId: profile?.id,
        employeeId,
        shiftLabel,
        duties: duties.split("\n").map((d) => d.trim()).filter(Boolean),
        schedules: schedules.map(({ key: _key, ...s }) => s),
      });
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-on-surface">{profile ? "แก้ไขความรับผิดชอบ" : "เพิ่มแอดมิน"}</h3>
          <button onClick={onClose} className="text-on-surface-variant">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {error && <p className="mb-2 text-sm font-semibold text-status-danger">{error}</p>}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant">พนักงาน</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!profile}
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm disabled:bg-surface-container-low"
            >
              <option value="">-- เลือกพนักงาน --</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} — {e.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant">กะ (ไม่บังคับ)</label>
            <input
              value={shiftLabel}
              onChange={(e) => setShiftLabel(e.target.value)}
              placeholder="เช่น กะเช้า / กะบ่าย / กะดึก"
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant px-3 text-sm"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-semibold text-on-surface-variant">ร้านที่รับผิดชอบ + วัน/เวลา</label>
              <button onClick={addSchedule} className="text-xs font-semibold text-primary">
                + เพิ่มร้าน
              </button>
            </div>
            <div className="space-y-2">
              {schedules.map((s) => (
                <div key={s.key} className="space-y-1.5 rounded-lg border border-outline-variant p-2.5">
                  <div className="flex gap-1.5">
                    <select
                      value={s.channelId}
                      onChange={(e) => updateSchedule(s.key, { channelId: e.target.value })}
                      className="h-9 flex-1 rounded-lg border border-outline-variant px-2 text-sm"
                    >
                      <option value="">-- เลือกร้าน --</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => removeSchedule(s.key)} className="text-status-danger">
                      <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                  </div>
                  <input
                    value={s.workDays}
                    onChange={(e) => updateSchedule(s.key, { workDays: e.target.value })}
                    placeholder="วันทำงาน เช่น จันทร์ - เสาร์"
                    className="h-9 w-full rounded-lg border border-outline-variant px-2 text-sm"
                  />
                  <div className="flex gap-1.5">
                    <input
                      type="time"
                      value={s.startTime}
                      onChange={(e) => updateSchedule(s.key, { startTime: e.target.value })}
                      className="h-9 flex-1 rounded-lg border border-outline-variant px-2 text-sm"
                    />
                    <input
                      type="time"
                      value={s.endTime}
                      onChange={(e) => updateSchedule(s.key, { endTime: e.target.value })}
                      className="h-9 flex-1 rounded-lg border border-outline-variant px-2 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-on-surface-variant">หน้าที่หลัก (บรรทัดละ 1 หน้าที่)</label>
            <textarea
              value={duties}
              onChange={(e) => setDuties(e.target.value)}
              rows={4}
              placeholder={"ตอบแชทลูกค้า\nดู Order\nประสานงานคลัง\nดูเคสลูกค้า"}
              className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={submit} disabled={isPending || !employeeId} className="h-10 flex-1 rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-50">
            {isPending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
          <button onClick={onClose} disabled={isPending} className="h-10 flex-1 rounded-lg border border-outline-variant text-sm font-semibold text-on-surface-variant">
            ยกเลิก
          </button>
        </div>
      </div>
    </div>
  );
}
