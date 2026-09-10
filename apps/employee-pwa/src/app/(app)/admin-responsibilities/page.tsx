"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface Channel {
  id: string;
  name: string;
}

interface ScheduleRow {
  id: string;
  profile_id: string;
  channel_id: string;
  work_days: string;
  start_time: string;
  end_time: string;
}

interface Profile {
  id: string;
  employeeId: string;
  name: string;
  jobTitle: string | null;
  photoUrl: string | null;
  shiftLabel: string | null;
  duties: string[];
  schedules: ScheduleRow[];
}

function timeLabel(t: string) {
  return t.slice(0, 5);
}

// Read-only mirror of admin-web's Admin Responsibility Management page — separate feature
// from /org-chart, own tables, no manager/report lines. Editing stays admin-web only
// (super_admin/hr); this page is view-only for everyone.
export default function AdminResponsibilitiesPage() {
  const { profile: authProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<"cards" | "schedule">("cards");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!authProfile) return;
    const [{ data: rows }, { data: schedules }, { data: channelRows }] = await Promise.all([
      supabase.rpc("get_admin_responsibility_profiles"),
      supabase.from("admin_responsibility_schedules").select("id, profile_id, channel_id, work_days, start_time, end_time"),
      supabase.from("admin_responsibility_channels").select("id, name").eq("org_id", authProfile.orgId).order("sort_order"),
    ]);

    const rawRows = (rows ?? []) as {
      profile_id: string;
      employee_id: string;
      first_name: string;
      last_name: string;
      photo_url: string | null;
      job_title: string | null;
      shift_label: string | null;
      duties: string[] | null;
    }[];
    const scheduleRows = (schedules ?? []) as ScheduleRow[];

    const photoPaths = Array.from(new Set(rawRows.map((r) => r.photo_url).filter((p): p is string => !!p)));
    const urlByPath = new Map<string, string>();
    if (photoPaths.length > 0) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrls(photoPaths, 3600);
      for (const item of signed ?? []) {
        if (item.signedUrl && item.path) urlByPath.set(item.path, item.signedUrl);
      }
    }

    setProfiles(
      rawRows.map((r) => ({
        id: r.profile_id,
        employeeId: r.employee_id,
        name: `${r.first_name} ${r.last_name}`,
        jobTitle: r.job_title,
        photoUrl: r.photo_url ? (urlByPath.get(r.photo_url) ?? null) : null,
        shiftLabel: r.shift_label,
        duties: r.duties ?? [],
        schedules: scheduleRows.filter((s) => s.profile_id === r.profile_id),
      }))
    );
    setChannels(channelRows ?? []);
    setLoaded(true);
  }, [authProfile, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const channelById = useMemo(() => new Map(channels.map((c) => [c.id, c.name])), [channels]);

  const { blocks, cellFor } = useMemo(() => {
    interface Entry {
      channelId: string;
      name: string;
      start: string;
      end: string;
    }
    const entries: Entry[] = [];
    for (const p of profiles) {
      for (const s of p.schedules) {
        entries.push({ channelId: s.channel_id, name: p.name, start: timeLabel(s.start_time), end: timeLabel(s.end_time) });
      }
    }
    const times = Array.from(new Set(entries.flatMap((e) => [e.start, e.end]))).sort();
    const blockList: { start: string; end: string }[] = [];
    for (let i = 0; i < times.length - 1; i++) blockList.push({ start: times[i], end: times[i + 1] });

    function cellFor(channelId: string, block: { start: string; end: string }): string {
      const names = entries.filter((e) => e.channelId === channelId && e.start <= block.start && e.end >= block.end).map((e) => e.name);
      return names.length > 0 ? Array.from(new Set(names)).join(", ") : "-";
    }
    return { blocks: blockList, cellFor };
  }, [profiles]);

  if (authLoading || !loaded) {
    return (
      <div className="safe-top flex min-h-[50vh] items-center justify-center px-4 pt-4">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        กลับ
      </button>

      <h1 className="text-lg font-bold text-primary">ความรับผิดชอบแอดมิน</h1>

      <div className="flex gap-1 rounded-lg bg-white p-1 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setTab("cards")}
          className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${tab === "cards" ? "bg-primary text-white" : "text-on-surface-variant"}`}
        >
          การ์ด
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition-colors ${tab === "schedule" ? "bg-primary text-white" : "text-on-surface-variant"}`}
        >
          ตารางเวลา
        </button>
      </div>

      {tab === "cards" ? (
        profiles.length === 0 ? (
          <p className="text-center text-sm text-on-surface-variant">ยังไม่มีข้อมูลความรับผิดชอบ</p>
        ) : (
          <div className="space-y-3">
            {profiles.map((p) => {
              const uniformKey = p.schedules.length > 0 ? `${p.schedules[0].work_days}|${p.schedules[0].start_time}|${p.schedules[0].end_time}` : null;
              const isUniform = uniformKey !== null && p.schedules.every((s) => `${s.work_days}|${s.start_time}|${s.end_time}` === uniformKey);

              return (
                <div key={p.id} className="rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container">
                      {p.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant">person</span>
                      )}
                    </span>
                    <div>
                      <p className="font-bold text-on-surface">{p.name}</p>
                      <p className="text-xs text-on-surface-variant">{p.jobTitle ?? "-"}</p>
                    </div>
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
      ) : channels.length === 0 || blocks.length === 0 ? (
        <p className="text-center text-sm text-on-surface-variant">ยังไม่มีตารางเวลาให้แสดง</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <table className="w-full min-w-[420px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="whitespace-nowrap px-3 py-2.5 font-bold text-on-surface-variant">เวลา</th>
                {channels.map((c) => (
                  <th key={c.id} className="whitespace-nowrap px-3 py-2.5 font-bold text-on-surface-variant">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {blocks.map((b) => (
                <tr key={`${b.start}-${b.end}`}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-on-surface">
                    {b.start}-{b.end}
                  </td>
                  {channels.map((c) => (
                    <td key={c.id} className="whitespace-nowrap px-3 py-2.5 text-on-surface">
                      {cellFor(c.id, b)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
