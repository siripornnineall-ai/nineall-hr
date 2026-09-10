"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Avatar } from "@/components/Avatar";
import type { ChannelOption, EmployeeOption, ProfileData } from "./types";
import { ProfileFormModal } from "./ProfileFormModal";
import { ChannelManagerModal } from "./ChannelManagerModal";
import { deleteProfileAction } from "./actions";

function timeLabel(t: string) {
  return t.slice(0, 5);
}

export function ResponsibilityBoard({
  profiles,
  channels,
  employees,
  canManage,
}: {
  profiles: ProfileData[];
  channels: ChannelOption[];
  employees: EmployeeOption[];
  canManage: boolean;
}) {
  const [tab, setTab] = useState<"cards" | "schedule">("cards");
  const [editingProfile, setEditingProfile] = useState<ProfileData | "new" | null>(null);
  const [managingChannels, setManagingChannels] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);

  async function handleDelete(profileId: string) {
    if (!confirm("ลบข้อมูลความรับผิดชอบของคนนี้?")) return;
    setDeletingId(profileId);
    await deleteProfileAction(profileId);
    setDeletingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-surface-container p-1">
          <button
            onClick={() => setTab("cards")}
            className={clsx(
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              tab === "cards" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"
            )}
          >
            การ์ด
          </button>
          <button
            onClick={() => setTab("schedule")}
            className={clsx(
              "rounded-md px-4 py-1.5 text-sm font-semibold transition-colors",
              tab === "schedule" ? "bg-white text-primary shadow-sm" : "text-on-surface-variant"
            )}
          >
            ตารางเวลา
          </button>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => setManagingChannels(true)}
              className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"
            >
              จัดการร้าน/ช่องทาง
            </button>
            <button onClick={() => setEditingProfile("new")} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm">
              <span className="material-symbols-outlined text-[18px]">add</span>
              เพิ่มแอดมิน
            </button>
          </div>
        )}
      </div>

      {tab === "cards" ? (
        profiles.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-white p-10 text-center text-on-surface-variant shadow-sm">
            ยังไม่มีข้อมูลความรับผิดชอบ
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => {
              // If every schedule shares the same days+time, show one unified line (matches
              // the simple case); otherwise break it down per channel so split coverage
              // (e.g. Shopee all day, Lazada mornings only) is still shown correctly.
              const uniformKey = p.schedules.length > 0 ? `${p.schedules[0].work_days}|${p.schedules[0].start_time}|${p.schedules[0].end_time}` : null;
              const isUniform = uniformKey !== null && p.schedules.every((s) => `${s.work_days}|${s.start_time}|${s.end_time}` === uniformKey);

              return (
                <div key={p.id} className="rounded-xl border border-outline-variant bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Avatar url={p.photoUrl} size={44} />
                      <div>
                        <p className="font-bold text-on-surface">{p.employeeName}</p>
                        <p className="text-xs text-on-surface-variant">{p.jobTitle ?? "-"}</p>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => setEditingProfile(p)} className="text-on-surface-variant hover:text-primary">
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="text-on-surface-variant hover:text-status-danger">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {p.schedules.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-outline-variant pt-3">
                      <div>
                        <p className="text-xs font-bold text-on-surface-variant">ร้านที่รับผิดชอบ:</p>
                        <p className="text-sm text-on-surface">{p.schedules.map((s) => channelById.get(s.channel_id) ?? "-").join(", ")}</p>
                      </div>

                      {isUniform ? (
                        <>
                          <div>
                            <p className="text-xs font-bold text-on-surface-variant">วันทำงาน:</p>
                            <p className="text-sm text-on-surface">{p.schedules[0].work_days}</p>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-on-surface-variant">เวลา:</p>
                            <p className="text-sm text-on-surface">
                              {timeLabel(p.schedules[0].start_time)} - {timeLabel(p.schedules[0].end_time)}
                            </p>
                          </div>
                        </>
                      ) : (
                        <div>
                          <p className="text-xs font-bold text-on-surface-variant">ตารางแยกตามร้าน:</p>
                          <ul className="mt-1 space-y-0.5">
                            {p.schedules.map((s) => (
                              <li key={s.id} className="text-sm text-on-surface">
                                {channelById.get(s.channel_id) ?? "-"}: {s.work_days} {timeLabel(s.start_time)}-{timeLabel(s.end_time)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {p.shiftLabel && (
                        <div>
                          <p className="text-xs font-bold text-on-surface-variant">กะ:</p>
                          <p className="text-sm text-on-surface">{p.shiftLabel}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {p.duties.length > 0 && (
                    <div className="mt-3 border-t border-outline-variant pt-3">
                      <p className="text-xs font-bold text-on-surface-variant">หน้าที่:</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5">
                        {p.duties.map((d, i) => (
                          <li key={i} className="text-sm text-on-surface">
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <ScheduleTable profiles={profiles} channels={channels} />
      )}

      {editingProfile && (
        <ProfileFormModal
          profile={editingProfile === "new" ? null : editingProfile}
          employees={employees}
          channels={channels}
          onClose={() => setEditingProfile(null)}
        />
      )}
      {managingChannels && <ChannelManagerModal channels={channels} onClose={() => setManagingChannels(false)} />}
    </div>
  );
}

function ScheduleTable({ profiles, channels }: { profiles: ProfileData[]; channels: ChannelOption[] }) {
  const { blocks, cellFor } = useMemo(() => {
    interface Entry {
      channelId: string;
      employeeName: string;
      start: string;
      end: string;
    }
    const entries: Entry[] = [];
    for (const p of profiles) {
      for (const s of p.schedules) {
        entries.push({ channelId: s.channel_id, employeeName: p.employeeName, start: timeLabel(s.start_time), end: timeLabel(s.end_time) });
      }
    }
    const times = Array.from(new Set(entries.flatMap((e) => [e.start, e.end]))).sort();
    const blockList: { start: string; end: string }[] = [];
    for (let i = 0; i < times.length - 1; i++) blockList.push({ start: times[i], end: times[i + 1] });

    function cellFor(channelId: string, block: { start: string; end: string }): string {
      const names = entries.filter((e) => e.channelId === channelId && e.start <= block.start && e.end >= block.end).map((e) => e.employeeName);
      return names.length > 0 ? Array.from(new Set(names)).join(", ") : "-";
    }

    return { blocks: blockList, cellFor };
  }, [profiles]);

  if (channels.length === 0 || blocks.length === 0) {
    return <div className="rounded-xl border border-outline-variant bg-white p-10 text-center text-on-surface-variant shadow-sm">ยังไม่มีตารางเวลาให้แสดง</div>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              <th className="whitespace-nowrap px-4 py-3 font-bold text-on-surface-variant">เวลา</th>
              {channels.map((c) => (
                <th key={c.id} className="whitespace-nowrap px-4 py-3 font-bold text-on-surface-variant">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {blocks.map((b) => (
              <tr key={`${b.start}-${b.end}`}>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-on-surface">
                  {b.start}-{b.end}
                </td>
                {channels.map((c) => (
                  <td key={c.id} className="whitespace-nowrap px-4 py-3 text-on-surface">
                    {cellFor(c.id, b)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
