"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  publish_at: string;
  expire_at: string | null;
  target_type: string;
  target_ids: string[];
}

export default function AnnouncementsPage() {
  const { profile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;

    async function load() {
      const nowIso = new Date().toISOString();

      const [{ data: employee }, { data: rows }] = await Promise.all([
        supabase.from("employees").select("department_id, team_id, branch_id").eq("id", profile!.employeeId).maybeSingle(),
        supabase
          .from("announcements")
          .select("id, title, body, publish_at, expire_at, target_type, target_ids")
          .eq("org_id", profile!.orgId)
          .eq("status", "published")
          .lte("publish_at", nowIso)
          .order("publish_at", { ascending: false }),
      ]);

      const visible = (rows ?? []).filter((a) => {
        if (a.expire_at && new Date(a.expire_at) < new Date()) return false;
        if (a.target_type === "all") return true;
        if (a.target_type === "employee") return a.target_ids.includes(profile!.employeeId);
        if (a.target_type === "department") return !!employee?.department_id && a.target_ids.includes(employee.department_id);
        if (a.target_type === "team") return !!employee?.team_id && a.target_ids.includes(employee.team_id);
        if (a.target_type === "branch") return !!employee?.branch_id && a.target_ids.includes(employee.branch_id);
        return false;
      });

      setAnnouncements(visible);
      setLoaded(true);
    }

    load();
  }, [profile, supabase]);

  return (
    <div className="safe-top space-y-4 px-4 pb-6 pt-4">
      <h1 className="text-lg font-bold text-primary">ประกาศบริษัท</h1>

      {loaded && announcements.length === 0 && <p className="text-sm text-on-surface-variant">ยังไม่มีประกาศ</p>}

      <div className="space-y-3">
        {announcements.map((a) => (
          <article key={a.id} className="space-y-2 rounded-2xl bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-on-surface">{a.title}</p>
              <span className="shrink-0 text-xs text-on-surface-variant">{new Date(a.publish_at).toLocaleDateString("th-TH")}</span>
            </div>
            <p className="whitespace-pre-line text-sm text-on-surface-variant">{a.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
