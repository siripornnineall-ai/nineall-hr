"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { isAnnouncementVisibleTo } from "@/lib/announcementVisibility";

interface AnnouncementDetail {
  id: string;
  title: string;
  body: string;
  publish_at: string;
}

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [announcement, setAnnouncement] = useState<AnnouncementDetail | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;

    async function load() {
      const [{ data: employee }, { data: row }] = await Promise.all([
        supabase.from("employees").select("department_id, team_id, branch_id").eq("id", profile!.employeeId).maybeSingle(),
        supabase
          .from("announcements")
          .select("id, title, body, publish_at, expire_at, status, target_type, target_ids")
          .eq("org_id", profile!.orgId)
          .eq("id", id)
          .maybeSingle(),
      ]);

      const visible =
        !!row &&
        row.status === "published" &&
        new Date(row.publish_at) <= new Date() &&
        isAnnouncementVisibleTo(
          { targetType: row.target_type, targetIds: row.target_ids, expireAt: row.expire_at },
          {
            employeeId: profile!.employeeId,
            departmentId: employee?.department_id ?? null,
            teamId: employee?.team_id ?? null,
            branchId: employee?.branch_id ?? null,
          }
        );

      setAnnouncement(visible ? { id: row.id, title: row.title, body: row.body, publish_at: row.publish_at } : null);
      setLoaded(true);
    }

    load();
  }, [profile, supabase, id]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <button onClick={() => router.push("/announcements")} className="flex items-center gap-1 text-sm font-semibold text-primary">
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        ประกาศบริษัท
      </button>

      {!loaded && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-5 text-sm text-on-surface-variant shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
          กำลังโหลด...
        </div>
      )}

      {loaded && !announcement && (
        <div className="rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-sm text-status-danger">ไม่พบประกาศนี้ หรือประกาศนี้ไม่ได้แสดงให้คุณเห็น</p>
        </div>
      )}

      {announcement && (
        <article className="space-y-3 rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
          <p className="text-xs text-on-surface-variant">{new Date(announcement.publish_at).toLocaleDateString("th-TH")}</p>
          <h1 className="text-lg font-bold text-on-surface">{announcement.title}</h1>
          <p className="whitespace-pre-line text-sm leading-relaxed text-on-surface-variant">{announcement.body}</p>
        </article>
      )}
    </div>
  );
}
